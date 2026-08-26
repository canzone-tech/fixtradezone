-- DEP-01 — USDT TRC20 deposit account + manual review foundation.
-- No wallet balance, ledger credit, package activation or blockchain custody is created here.

CREATE TABLE `deposit_accounts` (
  `id` CHAR(36) NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `asset` VARCHAR(10) NOT NULL DEFAULT 'USDT',
  `network` VARCHAR(20) NOT NULL DEFAULT 'TRC20',
  `walletAddress` VARCHAR(100) NOT NULL,
  `qrCodeDataUrl` MEDIUMTEXT NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `deposit_accounts_walletAddress_key` (`walletAddress`),
  INDEX `deposit_accounts_isActive_idx` (`isActive`),
  INDEX `deposit_accounts_createdByUserId_idx` (`createdByUserId`),
  INDEX `deposit_accounts_updatedByUserId_idx` (`updatedByUserId`),

  CONSTRAINT `deposit_accounts_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `deposit_accounts_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `deposit_accounts_asset_check` CHECK (`asset` = 'USDT'),
  CONSTRAINT `deposit_accounts_network_check` CHECK (`network` = 'TRC20'),
  CONSTRAINT `deposit_accounts_revision_check` CHECK (`revision` >= 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `deposits` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `openKey` CHAR(36) NULL,
  `status` ENUM('AWAITING_TXID', 'PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'AWAITING_TXID',

  `packagePlanVersionId` CHAR(36) NOT NULL,
  `packagePlanItemId` CHAR(36) NOT NULL,
  `packageCode` VARCHAR(64) NOT NULL,
  `packageDisplayName` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(20, 8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,

  `assignedDepositAccountId` CHAR(36) NOT NULL,
  `assignedAccountLabel` VARCHAR(100) NOT NULL,
  `assignedWalletAddress` VARCHAR(100) NOT NULL,
  `assignedNetwork` VARCHAR(20) NOT NULL,
  `assignedQrCodeDataUrl` MEDIUMTEXT NOT NULL,

  `txid` CHAR(64) NULL,
  `submittedAt` DATETIME(3) NULL,
  `reviewedByUserId` CHAR(36) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewNote` VARCHAR(1000) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `deposits_openKey_key` (`openKey`),
  UNIQUE INDEX `deposits_txid_key` (`txid`),
  INDEX `deposits_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `deposits_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `deposits_packagePlanVersionId_idx` (`packagePlanVersionId`),
  INDEX `deposits_packagePlanItemId_idx` (`packagePlanItemId`),
  INDEX `deposits_assignedDepositAccountId_idx` (`assignedDepositAccountId`),
  INDEX `deposits_reviewedByUserId_idx` (`reviewedByUserId`),

  CONSTRAINT `deposits_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `deposits_packagePlanVersionId_fkey`
    FOREIGN KEY (`packagePlanVersionId`) REFERENCES `package_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `deposits_packagePlanItemId_fkey`
    FOREIGN KEY (`packagePlanItemId`) REFERENCES `package_plan_items`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `deposits_assignedDepositAccountId_fkey`
    FOREIGN KEY (`assignedDepositAccountId`) REFERENCES `deposit_accounts`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `deposits_reviewedByUserId_fkey`
    FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `deposits_amount_check` CHECK (`amount` > 0),
  CONSTRAINT `deposits_currency_check` CHECK (`currency` = 'USDT'),
  CONSTRAINT `deposits_network_check` CHECK (`assignedNetwork` = 'TRC20'),
  -- MySQL does not allow a CHECK to reference userId here because userId also
  -- participates in an FK with referential actions. Service writes still set
  -- openKey=userId for open states; this CHECK enforces the DB-safe nullability
  -- half of that invariant while the unique index prevents parallel open rows.
  CONSTRAINT `deposits_open_key_check` CHECK (
    (`status` IN ('AWAITING_TXID', 'PENDING_REVIEW') AND `openKey` IS NOT NULL)
    OR
    (`status` IN ('APPROVED', 'REJECTED') AND `openKey` IS NULL)
  ),
  CONSTRAINT `deposits_txid_state_check` CHECK (
    (`status` = 'AWAITING_TXID' AND `txid` IS NULL AND `submittedAt` IS NULL)
    OR
    (`status` IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED') AND `txid` IS NOT NULL AND `submittedAt` IS NOT NULL)
  ),
  CONSTRAINT `deposits_review_state_check` CHECK (
    (`status` IN ('AWAITING_TXID', 'PENDING_REVIEW') AND `reviewedAt` IS NULL AND `reviewNote` IS NULL)
    OR
    (`status` IN ('APPROVED', 'REJECTED') AND `reviewedAt` IS NOT NULL AND `reviewNote` IS NOT NULL)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Permissions are also upserted by RbacBootstrapService. INSERT IGNORE makes the
-- migration immediately testable before/without relying on a bootstrap race.
INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'deposits.accounts.read', 'View USDT TRC20 receiving accounts', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'deposits.accounts.manage', 'Create and manage USDT TRC20 receiving accounts', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'deposits.read', 'View deposit requests and payment review state', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'deposits.review', 'Approve or reject submitted deposit payments', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));