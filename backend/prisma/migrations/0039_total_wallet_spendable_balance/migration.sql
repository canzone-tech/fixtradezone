-- TOTAL-WALLET-01 — authoritative spendable Total Wallet.
-- Forward-only. Existing source-bucket, package and payout history remain immutable.
--
-- Locked business rules:
-- - Total Wallet is the USER's spendable balance for BOTH payout and package
--   purchase/activation.
-- - MAIN / PACKAGE_EARNINGS / REFERRAL_COMMISSION / REWARDS remain source
--   accounting balances and are NOT reduced by a Total Wallet payout or a new
--   package purchase/activation.
-- - Total Wallet available value is derived from the current source-bucket
--   balances plus immutable Total-Wallet-only adjustment events.
-- - New payouts reserve from TOTAL_WALLET only.
-- - New package activations spend TOTAL_WALLET only.
-- - No database trigger, stored function, SUPER privilege, or
--   log_bin_trust_function_creators override is required.
-- - Legacy payout source buckets and historical package funding remain preserved
--   for historical lifecycle completion/readback only.
--
-- Recovery safety:
-- An earlier pre-acceptance revision of 0039 could fail while creating a MySQL
-- trigger when binary logging was enabled. Prisma records that migration as
-- failed, but MySQL DDL before the failing statement may remain. This migration
-- therefore removes only 0039-owned pre-acceptance projection objects before
-- rebuilding them in the trigger-free form. Existing ledger/history tables are
-- never rewritten.

DROP TRIGGER IF EXISTS `total_wallet_from_component_entry`;
DROP TRIGGER IF EXISTS `total_wallet_balance_from_event`;

SET @total_wallet_balance_object_type = (
  SELECT `TABLE_TYPE`
  FROM `information_schema`.`TABLES`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'user_total_wallet_balances'
  LIMIT 1
);
SET @drop_total_wallet_balance_object = CASE
  WHEN @total_wallet_balance_object_type = 'VIEW'
    THEN 'DROP VIEW `user_total_wallet_balances`'
  WHEN @total_wallet_balance_object_type = 'BASE TABLE'
    THEN 'DROP TABLE `user_total_wallet_balances`'
  ELSE 'SELECT 1'
END;
PREPARE total_wallet_drop_statement FROM @drop_total_wallet_balance_object;
EXECUTE total_wallet_drop_statement;
DEALLOCATE PREPARE total_wallet_drop_statement;

DROP TABLE IF EXISTS `user_total_wallet_events`;

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

-- Total Wallet is intentionally NOT a fifth USER ledger bucket. The four source
-- balances keep their immutable accounting meaning. Only Total-Wallet-only
-- economic actions (new payout reserve/release and new package purchase) create
-- rows in user_total_wallet_events. This view therefore remains current when a
-- future deposit/earning/commission/reward changes a source balance without any
-- trigger-based mirroring.
CREATE VIEW `user_total_wallet_balances` AS
SELECT
  wallet_keys.`userId`,
  wallet_keys.`currency`,
  CAST(
    COALESCE(source_balances.`sourceBalance`, 0.00000000)
      + COALESCE(total_events.`eventDelta`, 0.00000000)
    AS DECIMAL(20,8)
  ) AS `balance`,
  COALESCE(total_events.`eventCount`, 0) AS `revision`,
  total_events.`firstEventAt` AS `createdAt`,
  total_events.`lastEventAt` AS `updatedAt`
FROM (
  SELECT
    la.`ownerUserId` AS `userId`,
    la.`currency`
  FROM `ledger_accounts` la
  WHERE la.`ownerType` = 'USER'
    AND la.`bucket` IN (
      'MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS'
    )
  GROUP BY la.`ownerUserId`, la.`currency`

  UNION

  SELECT
    event_rows.`userId`,
    event_rows.`currency`
  FROM `user_total_wallet_events` event_rows
  GROUP BY event_rows.`userId`, event_rows.`currency`
) wallet_keys
LEFT JOIN (
  SELECT
    la.`ownerUserId` AS `userId`,
    la.`currency`,
    SUM(COALESCE(lb.`balance`, 0.00000000)) AS `sourceBalance`
  FROM `ledger_accounts` la
  LEFT JOIN `ledger_account_balances` lb
    ON lb.`accountId` = la.`id`
  WHERE la.`ownerType` = 'USER'
    AND la.`bucket` IN (
      'MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS'
    )
  GROUP BY la.`ownerUserId`, la.`currency`
) source_balances
  ON source_balances.`userId` = wallet_keys.`userId`
 AND source_balances.`currency` = wallet_keys.`currency`
LEFT JOIN (
  SELECT
    event_rows.`userId`,
    event_rows.`currency`,
    SUM(
      CASE
        WHEN event_rows.`direction` = 'CREDIT' THEN event_rows.`amount`
        ELSE -event_rows.`amount`
      END
    ) AS `eventDelta`,
    COUNT(*) AS `eventCount`,
    MIN(event_rows.`createdAt`) AS `firstEventAt`,
    MAX(event_rows.`createdAt`) AS `lastEventAt`
  FROM `user_total_wallet_events` event_rows
  GROUP BY event_rows.`userId`, event_rows.`currency`
) total_events
  ON total_events.`userId` = wallet_keys.`userId`
 AND total_events.`currency` = wallet_keys.`currency`;

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
  p.`id`,
  'TOTAL_WALLET',
  FALSE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `payout_policy_versions` p
WHERE NOT EXISTS (
  SELECT 1
  FROM `payout_policy_bucket_rules` existing
  WHERE existing.`policyVersionId` = p.`id`
    AND existing.`bucket` = 'TOTAL_WALLET'
);
