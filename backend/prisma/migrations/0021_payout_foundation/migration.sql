-- PAYOUT-01 — Withdrawal & Payout foundation.
-- Forward-only. Existing migrations remain immutable.
-- Payout requests reserve funds atomically, rejection releases reserves,
-- completion settles reserves, and all financial movement is double-entry.

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
    'PAYOUT_FEE_REVENUE'
  ) NOT NULL;

ALTER TABLE `ledger_transactions`
  MODIFY `kind` ENUM(
    'DEPOSIT_CREDIT',
    'PACKAGE_ACTIVATION_FUNDING',
    'REFERRAL_COMMISSION_CREDIT',
    'PACKAGE_REWARD_CREDIT',
    'INTERNAL_TRADING_SETTLEMENT',
    'PAYOUT_RESERVE',
    'PAYOUT_RELEASE',
    'PAYOUT_SETTLEMENT'
  ) NOT NULL;

CREATE TABLE `payout_policy_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,
  `requestsEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `asset` VARCHAR(10) NOT NULL DEFAULT 'USDT',
  `networkCode` VARCHAR(40) NOT NULL DEFAULT 'TRC20',
  `validationProfile` ENUM('TRON', 'EVM', 'SOLANA') NOT NULL DEFAULT 'TRON',
  `minimumAmount` DECIMAL(20,8) NULL,
  `maximumAmount` DECIMAL(20,8) NULL,
  `fixedFeeAmount` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000,
  `percentageFee` DECIMAL(9,6) NOT NULL DEFAULT 0.000000,
  `effectiveFrom` DATETIME(3) NULL,
  `effectiveTo` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `publishedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `payout_policy_version_key` (`versionNumber`),
  INDEX `payout_policy_effective_idx` (`status`, `requestsEnabled`, `effectiveFrom`, `effectiveTo`),
  INDEX `payout_policy_created_by_idx` (`createdByUserId`),
  INDEX `payout_policy_updated_by_idx` (`updatedByUserId`),
  INDEX `payout_policy_published_by_idx` (`publishedByUserId`),

  CONSTRAINT `payout_policy_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payout_policy_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payout_policy_published_by_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payout_policy_revision_check` CHECK (`revision` > 0),
  CONSTRAINT `payout_policy_minimum_check` CHECK (`minimumAmount` IS NULL OR `minimumAmount` > 0),
  CONSTRAINT `payout_policy_maximum_check` CHECK (`maximumAmount` IS NULL OR `maximumAmount` > 0),
  CONSTRAINT `payout_policy_range_check` CHECK (
    `minimumAmount` IS NULL OR `maximumAmount` IS NULL OR `maximumAmount` >= `minimumAmount`
  ),
  CONSTRAINT `payout_policy_fixed_fee_check` CHECK (`fixedFeeAmount` >= 0),
  CONSTRAINT `payout_policy_percentage_fee_check` CHECK (`percentageFee` >= 0 AND `percentageFee` <= 100),
  CONSTRAINT `payout_policy_effective_range_check` CHECK (
    `effectiveTo` IS NULL OR `effectiveFrom` IS NULL OR `effectiveTo` > `effectiveFrom`
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payout_policy_bucket_rules` (
  `id` CHAR(36) NOT NULL,
  `policyVersionId` CHAR(36) NOT NULL,
  `bucket` ENUM('MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS') NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `payout_policy_bucket_key` (`policyVersionId`, `bucket`),
  INDEX `payout_policy_bucket_enabled_idx` (`policyVersionId`, `enabled`, `bucket`),

  CONSTRAINT `payout_policy_bucket_policy_fkey`
    FOREIGN KEY (`policyVersionId`) REFERENCES `payout_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payout_requests` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `requestKey` CHAR(36) NOT NULL,
  `policyVersionId` CHAR(36) NOT NULL,
  `sourceBucket` ENUM('MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS') NOT NULL,
  `asset` VARCHAR(10) NOT NULL,
  `networkCode` VARCHAR(40) NOT NULL,
  `validationProfile` ENUM('TRON', 'EVM', 'SOLANA') NOT NULL,
  `grossAmount` DECIMAL(20,8) NOT NULL,
  `feeAmount` DECIMAL(20,8) NOT NULL,
  `netAmount` DECIMAL(20,8) NOT NULL,
  `destinationAddress` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING_REVIEW', 'APPROVED', 'SUBMITTED', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `reviewedByUserId` CHAR(36) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewNote` VARCHAR(1000) NULL,
  `externalTxid` VARCHAR(191) NULL,
  `submittedByUserId` CHAR(36) NULL,
  `submittedAt` DATETIME(3) NULL,
  `completedByUserId` CHAR(36) NULL,
  `completedAt` DATETIME(3) NULL,
  `reserveLedgerTransactionId` CHAR(36) NULL,
  `releaseLedgerTransactionId` CHAR(36) NULL,
  `settlementLedgerTransactionId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `payout_request_user_key` (`userId`, `requestKey`),
  UNIQUE INDEX `payout_request_network_txid_key` (`networkCode`, `externalTxid`),
  UNIQUE INDEX `payout_request_reserve_ledger_key` (`reserveLedgerTransactionId`),
  UNIQUE INDEX `payout_request_release_ledger_key` (`releaseLedgerTransactionId`),
  UNIQUE INDEX `payout_request_settlement_ledger_key` (`settlementLedgerTransactionId`),
  INDEX `payout_request_user_created_idx` (`userId`, `createdAt`),
  INDEX `payout_request_status_created_idx` (`status`, `createdAt`),
  INDEX `payout_request_policy_idx` (`policyVersionId`),
  INDEX `payout_request_reviewed_by_idx` (`reviewedByUserId`),
  INDEX `payout_request_submitted_by_idx` (`submittedByUserId`),
  INDEX `payout_request_completed_by_idx` (`completedByUserId`),

  CONSTRAINT `payout_request_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payout_request_policy_fkey`
    FOREIGN KEY (`policyVersionId`) REFERENCES `payout_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payout_request_reviewed_by_fkey`
    FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payout_request_submitted_by_fkey`
    FOREIGN KEY (`submittedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payout_request_completed_by_fkey`
    FOREIGN KEY (`completedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payout_request_reserve_ledger_fkey`
    FOREIGN KEY (`reserveLedgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payout_request_release_ledger_fkey`
    FOREIGN KEY (`releaseLedgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payout_request_settlement_ledger_fkey`
    FOREIGN KEY (`settlementLedgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `payout_request_gross_check` CHECK (`grossAmount` > 0),
  CONSTRAINT `payout_request_fee_check` CHECK (`feeAmount` >= 0),
  CONSTRAINT `payout_request_net_check` CHECK (`netAmount` > 0),
  CONSTRAINT `payout_request_amount_equation_check` CHECK (`grossAmount` = (`netAmount` + `feeAmount`))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Fail-closed initial draft: no financial effect until explicitly published/enabled.
INSERT INTO `payout_policy_versions` (
  `id`, `versionNumber`, `status`, `revision`, `requestsEnabled`,
  `asset`, `networkCode`, `validationProfile`,
  `minimumAmount`, `maximumAmount`, `fixedFeeAmount`, `percentageFee`,
  `createdAt`, `updatedAt`
) VALUES (
  UUID(), 1, 'DRAFT', 1, FALSE,
  'USDT', 'TRC20', 'TRON',
  NULL, NULL, 0.00000000, 0.000000,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);

INSERT INTO `payout_policy_bucket_rules` (
  `id`, `policyVersionId`, `bucket`, `enabled`, `createdAt`, `updatedAt`
)
SELECT UUID(), p.id, buckets.bucket, FALSE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `payout_policy_versions` p
JOIN (
  SELECT 'MAIN' AS bucket
  UNION ALL SELECT 'PACKAGE_EARNINGS'
  UNION ALL SELECT 'REFERRAL_COMMISSION'
  UNION ALL SELECT 'REWARDS'
) buckets
WHERE p.versionNumber = 1;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'payouts.read', 'View payout policies, requests and payout operational state', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'payouts.review', 'Approve, reject, submit and complete payout requests', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'payouts.policy.manage', 'Create, edit and publish versioned payout policies', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));