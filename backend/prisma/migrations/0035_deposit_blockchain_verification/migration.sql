-- DEP-03: blockchain verification evidence for configured deposit payment rails.
-- Phase 1 is VERIFY_ONLY: on-chain checks strengthen manual review but do not
-- auto-approve, credit wallets, activate packages, or trigger downstream earnings.

CREATE TABLE `deposit_payment_rail_blockchain_configs` (
  `paymentRailId` CHAR(36) NOT NULL,
  `verificationMode` ENUM('OFF', 'VERIFY_ONLY') NOT NULL DEFAULT 'OFF',
  `chainId` INT UNSIGNED NULL,
  `tokenContractAddress` VARCHAR(100) NULL,
  `tokenDecimals` TINYINT UNSIGNED NULL,
  `requiredConfirmations` SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  `revision` INT UNSIGNED NOT NULL DEFAULT 1,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`paymentRailId`),
  KEY `dprbc_updated_by_idx` (`updatedByUserId`),
  CONSTRAINT `dprbc_rail_fk`
    FOREIGN KEY (`paymentRailId`) REFERENCES `deposit_payment_rails` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dprbc_updated_by_fk`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `deposit_blockchain_verifications` (
  `depositId` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'VERIFIED', 'FAILED', 'UNAVAILABLE') NOT NULL,
  `provider` VARCHAR(40) NOT NULL DEFAULT 'BSC_JSON_RPC',
  `chainId` INT UNSIGNED NULL,
  `tokenContractAddress` VARCHAR(100) NULL,
  `tokenDecimals` TINYINT UNSIGNED NULL,
  `requiredConfirmations` SMALLINT UNSIGNED NULL,
  `observedConfirmations` INT UNSIGNED NULL,
  `blockNumber` BIGINT UNSIGNED NULL,
  `onChainAmount` VARCHAR(100) NULL,
  `receivingAddress` VARCHAR(100) NULL,
  `txid` VARCHAR(191) NULL,
  `failureCode` VARCHAR(64) NULL,
  `failureReason` VARCHAR(500) NULL,
  `attemptCount` INT UNSIGNED NOT NULL DEFAULT 1,
  `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `verifiedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`depositId`),
  KEY `dbv_status_idx` (`status`, `updatedAt`),
  CONSTRAINT `dbv_deposit_fk`
    FOREIGN KEY (`depositId`) REFERENCES `deposits` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
