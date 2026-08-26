-- DEP-01 hardening — introduce a data-driven payment-rail master without rewriting applied 0008 history.

CREATE TABLE `deposit_payment_rails` (
  `id` CHAR(36) NOT NULL,
  `asset` VARCHAR(10) NOT NULL,
  `networkCode` VARCHAR(40) NOT NULL,
  `displayName` VARCHAR(100) NOT NULL,
  `validationProfile` ENUM('TRON', 'EVM', 'SOLANA') NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `deposit_payment_rails_asset_networkCode_key` (`asset`, `networkCode`),
  INDEX `deposit_payment_rails_asset_isActive_idx` (`asset`, `isActive`),
  INDEX `deposit_payment_rails_createdByUserId_idx` (`createdByUserId`),
  INDEX `deposit_payment_rails_updatedByUserId_idx` (`updatedByUserId`),

  CONSTRAINT `deposit_payment_rails_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deposit_payment_rails_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `deposit_payment_rails_asset_check`
    CHECK (`asset` REGEXP '^[A-Z0-9]{2,10}$'),
  CONSTRAINT `deposit_payment_rails_network_code_check`
    CHECK (`networkCode` REGEXP '^[A-Z0-9_-]{2,40}$'),
  CONSTRAINT `deposit_payment_rails_revision_check`
    CHECK (`revision` >= 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Deterministic V1 rail so existing 0008 rows can be backfilled safely.
INSERT INTO `deposit_payment_rails` (
  `id`, `asset`, `networkCode`, `displayName`, `validationProfile`, `isActive`, `revision`, `createdAt`, `updatedAt`
) VALUES (
  '00000000-0000-4000-8000-000000000901',
  'USDT',
  'TRC20',
  'USDT on TRON (TRC20)',
  'TRON',
  TRUE,
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);

ALTER TABLE `deposit_accounts`
  ADD COLUMN `paymentRailId` CHAR(36) NULL AFTER `label`;

UPDATE `deposit_accounts`
SET `paymentRailId` = '00000000-0000-4000-8000-000000000901'
WHERE `asset` = 'USDT' AND `network` = 'TRC20';

ALTER TABLE `deposit_accounts`
  MODIFY `paymentRailId` CHAR(36) NOT NULL,
  DROP CHECK `deposit_accounts_asset_check`,
  DROP CHECK `deposit_accounts_network_check`,
  DROP INDEX `deposit_accounts_walletAddress_key`,
  ADD UNIQUE INDEX `deposit_accounts_paymentRailId_walletAddress_key` (`paymentRailId`, `walletAddress`),
  ADD INDEX `deposit_accounts_paymentRailId_isActive_idx` (`paymentRailId`, `isActive`),
  ADD CONSTRAINT `deposit_accounts_paymentRailId_fkey`
    FOREIGN KEY (`paymentRailId`) REFERENCES `deposit_payment_rails`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `deposits`
  DROP CHECK `deposits_currency_check`,
  DROP CHECK `deposits_network_check`,
  DROP INDEX `deposits_txid_key`,
  MODIFY `txid` VARCHAR(191) NULL,
  ADD COLUMN `assignedValidationProfile` ENUM('TRON', 'EVM', 'SOLANA') NULL AFTER `assignedNetwork`;

UPDATE `deposits`
SET `assignedValidationProfile` = 'TRON'
WHERE `assignedNetwork` = 'TRC20';

ALTER TABLE `deposits`
  MODIFY `assignedValidationProfile` ENUM('TRON', 'EVM', 'SOLANA') NOT NULL,
  ADD UNIQUE INDEX `deposits_assignedNetwork_txid_key` (`assignedNetwork`, `txid`);
