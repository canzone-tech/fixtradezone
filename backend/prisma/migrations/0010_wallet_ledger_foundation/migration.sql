-- WAL-01 — immutable double-entry wallet / ledger foundation.
-- Ledger entries are accounting source-of-truth; balance rows are transactional read models.

CREATE TABLE `ledger_accounts` (
  `id` CHAR(36) NOT NULL,
  `accountKey` VARCHAR(191) NOT NULL,
  `ownerType` ENUM('SYSTEM', 'USER') NOT NULL,
  `ownerUserId` CHAR(36) NULL,
  `bucket` ENUM('MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS', 'DEPOSIT_CLEARING') NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `normalSide` ENUM('DEBIT', 'CREDIT') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ledger_accounts_accountKey_key` (`accountKey`),
  INDEX `ledger_accounts_ownerUserId_currency_idx` (`ownerUserId`, `currency`),
  INDEX `ledger_accounts_ownerType_bucket_currency_idx` (`ownerType`, `bucket`, `currency`),

  CONSTRAINT `ledger_accounts_ownerUserId_fkey`
    FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ledger_account_balances` (
  `accountId` CHAR(36) NOT NULL,
  `balance` DECIMAL(20, 8) NOT NULL DEFAULT 0.00000000,
  `revision` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`accountId`),
  CONSTRAINT `ledger_account_balances_accountId_fkey`
    FOREIGN KEY (`accountId`) REFERENCES `ledger_accounts`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ledger_transactions` (
  `id` CHAR(36) NOT NULL,
  `kind` ENUM('DEPOSIT_CREDIT') NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(40) NOT NULL,
  `sourceId` VARCHAR(100) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `postedByUserId` CHAR(36) NULL,
  `description` VARCHAR(500) NOT NULL,
  `metadata` JSON NULL,
  `postedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ledger_transactions_sourceKey_key` (`sourceKey`),
  INDEX `ledger_transactions_source_idx` (`sourceType`, `sourceId`),
  INDEX `ledger_transactions_currency_postedAt_idx` (`currency`, `postedAt`),
  INDEX `ledger_transactions_postedByUserId_idx` (`postedByUserId`),

  CONSTRAINT `ledger_transactions_postedByUserId_fkey`
    FOREIGN KEY (`postedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ledger_entries` (
  `id` CHAR(36) NOT NULL,
  `transactionId` CHAR(36) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `side` ENUM('DEBIT', 'CREDIT') NOT NULL,
  `amount` DECIMAL(20, 8) NOT NULL,
  `memo` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `ledger_entries_transactionId_idx` (`transactionId`),
  INDEX `ledger_entries_accountId_createdAt_idx` (`accountId`, `createdAt`),

  CONSTRAINT `ledger_entries_transactionId_fkey`
    FOREIGN KEY (`transactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ledger_entries_accountId_fkey`
    FOREIGN KEY (`accountId`) REFERENCES `ledger_accounts`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ledger_entries_amount_check` CHECK (`amount` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'wallets.read', 'View USER wallet balances and bucket summaries', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'ledger.read', 'View immutable accounting transactions and entries', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'ledger.post', 'Post or reconcile eligible approved deposits into the ledger', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
