-- TOTAL-WALLET-01 — authoritative spendable Total Wallet.
-- Forward-only. Existing source-bucket, package and payout history remain immutable.
--
-- Locked business rules:
-- - Total Wallet is the authoritative spendable balance.
-- - MAIN / PACKAGE_EARNINGS / REFERRAL_COMMISSION / REWARDS remain source
--   accounting balances and are NOT reduced by a Total Wallet payout or a new
--   package purchase/activation.
-- - Future component ledger economic credits/debits are mirrored into immutable
--   Total Wallet events where they represent incoming/outgoing value.
-- - New payouts reserve from TOTAL_WALLET only.
-- - New package activations spend TOTAL_WALLET only; component balances stay
--   unchanged and package-principal ledger accounting uses the system Total
--   Wallet control account.
-- - Legacy payout source buckets and historical package funding remain preserved
--   for historical lifecycle completion/readback only.

CREATE TABLE `user_total_wallet_balances` (
  `userId` CHAR(36) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `balance` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000,
  `revision` BIGINT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`userId`, `currency`),
  INDEX `total_wallet_currency_idx` (`currency`),

  CONSTRAINT `total_wallet_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `total_wallet_balance_nonnegative_check` CHECK (`balance` >= 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_total_wallet_events` (
  `id` CHAR(36) NOT NULL,
  `eventKey` VARCHAR(191) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `direction` ENUM('DEBIT', 'CREDIT') NOT NULL,
  `amount` DECIMAL(20,8) NOT NULL,
  `reason` VARCHAR(80) NOT NULL,
  `ledgerTransactionId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `total_wallet_event_key` (`eventKey`),
  INDEX `total_wallet_event_user_idx` (`userId`, `currency`, `createdAt`),
  INDEX `total_wallet_event_ledger_idx` (`ledgerTransactionId`),

  CONSTRAINT `total_wallet_event_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `total_wallet_event_ledger_fkey`
    FOREIGN KEY (`ledgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `total_wallet_event_amount_check` CHECK (`amount` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Opening spendable balance equals the currently available sum at migration
-- time. Historical source ledger rows are not rewritten.
INSERT INTO `user_total_wallet_balances` (
  `userId`, `currency`, `balance`, `revision`, `createdAt`, `updatedAt`
)
SELECT
  la.ownerUserId,
  la.currency,
  SUM(COALESCE(lb.balance, 0.00000000)),
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `ledger_accounts` la
LEFT JOIN `ledger_account_balances` lb ON lb.accountId = la.id
WHERE la.ownerType = 'USER'
  AND la.bucket IN ('MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS')
GROUP BY la.ownerUserId, la.currency;

INSERT INTO `user_total_wallet_events` (
  `id`, `eventKey`, `userId`, `currency`, `direction`, `amount`, `reason`,
  `ledgerTransactionId`, `createdAt`
)
SELECT
  UUID(),
  CONCAT('TOTAL_WALLET:OPENING:', tw.userId, ':', tw.currency),
  tw.userId,
  tw.currency,
  'CREDIT',
  tw.balance,
  'OPENING_BALANCE',
  NULL,
  CURRENT_TIMESTAMP(3)
FROM `user_total_wallet_balances` tw
WHERE tw.balance > 0;

-- Future component ledger entries mirror their economic effect into the Total
-- Wallet event stream. Package purchase/activation does NOT debit a USER
-- component ledger account under the new lock; it posts its own explicit Total
-- Wallet debit event in application accounting. A duplicate event is an
-- accounting conflict and therefore fails closed instead of being ignored.
CREATE TRIGGER `total_wallet_from_component_entry`
AFTER INSERT ON `ledger_entries`
FOR EACH ROW
INSERT INTO `user_total_wallet_events` (
  `id`, `eventKey`, `userId`, `currency`, `direction`, `amount`, `reason`,
  `ledgerTransactionId`, `createdAt`
)
SELECT
  UUID(),
  CONCAT('LEDGER_ENTRY:', NEW.id),
  la.ownerUserId,
  la.currency,
  NEW.side,
  NEW.amount,
  'SOURCE_LEDGER_SYNC',
  NEW.transactionId,
  CURRENT_TIMESTAMP(3)
FROM `ledger_accounts` la
WHERE la.id = NEW.accountId
  AND la.ownerType = 'USER'
  AND la.bucket IN ('MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS');

-- Total Wallet balances are a projection of immutable Total Wallet events.
CREATE TRIGGER `total_wallet_balance_from_event`
AFTER INSERT ON `user_total_wallet_events`
FOR EACH ROW
INSERT INTO `user_total_wallet_balances` (
  `userId`, `currency`, `balance`, `revision`, `createdAt`, `updatedAt`
) VALUES (
  NEW.userId,
  NEW.currency,
  IF(NEW.direction = 'CREDIT', NEW.amount, -NEW.amount),
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `balance` = `balance` + IF(NEW.direction = 'CREDIT', NEW.amount, -NEW.amount),
  `revision` = `revision` + 1,
  `updatedAt` = CURRENT_TIMESTAMP(3);

ALTER TABLE `payout_policy_bucket_rules`
  MODIFY `bucket` ENUM(
    'MAIN',
    'PACKAGE_EARNINGS',
    'REFERRAL_COMMISSION',
    'REWARDS',
    'TOTAL_WALLET'
  ) NOT NULL;

ALTER TABLE `payout_requests`
  MODIFY `sourceBucket` ENUM(
    'MAIN',
    'PACKAGE_EARNINGS',
    'REFERRAL_COMMISSION',
    'REWARDS',
    'TOTAL_WALLET'
  ) NOT NULL;

ALTER TABLE `ledger_accounts`
  MODIFY `bucket` ENUM(
    'MAIN',
    'PACKAGE_EARNINGS',
    'REFERRAL_COMMISSION',
    'REWARDS',
    'DEPOSIT_CLEARING',
    'PACKAGE_PRINCIPAL',
    'REFERRAL_COMMISSION_EXPENSE',
    'PACKAGE_REWARD_EXPENSE',
    'INTERNAL_TRADING_RETURN_EXPENSE',
    'INTERNAL_TRADING_ADMIN_PROFIT',
    'PAYOUT_RESERVE',
    'PAYOUT_SETTLEMENT',
    'PAYOUT_FEE_REVENUE',
    'AWARD_REWARD_EXPENSE',
    'PAYOUT_TOTAL_WALLET_CONTROL'
  ) NOT NULL;

-- Existing policies remain immutable. Add the new rule row disabled so a new
-- draft must be explicitly saved/published before Total Wallet payouts open.
INSERT INTO `payout_policy_bucket_rules` (
  `id`, `policyVersionId`, `bucket`, `enabled`, `createdAt`, `updatedAt`
)
SELECT
  UUID(),
  p.id,
  'TOTAL_WALLET',
  FALSE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `payout_policy_versions` p
WHERE NOT EXISTS (
  SELECT 1
  FROM `payout_policy_bucket_rules` existing
  WHERE existing.policyVersionId = p.id
    AND existing.bucket = 'TOTAL_WALLET'
);
