-- COMM-01 — referral commission foundation.
-- Forward-only migration. Applied WAL/SUB migrations remain immutable.

ALTER TABLE `ledger_accounts`
  MODIFY `bucket` ENUM(
    'MAIN',
    'PACKAGE_EARNINGS',
    'REFERRAL_COMMISSION',
    'REWARDS',
    'DEPOSIT_CLEARING',
    'PACKAGE_PRINCIPAL',
    'REFERRAL_COMMISSION_EXPENSE'
  ) NOT NULL;

ALTER TABLE `ledger_transactions`
  MODIFY `kind` ENUM(
    'DEPOSIT_CREDIT',
    'PACKAGE_ACTIVATION_FUNDING',
    'REFERRAL_COMMISSION_CREDIT'
  ) NOT NULL;

CREATE TABLE `referral_commission_plan_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,
  `firstPurchaseEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `newPurchaseEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `renewalEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `upgradeEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `upgradeBaseMode` ENUM('FULL', 'INCREMENTAL') NOT NULL DEFAULT 'INCREMENTAL',
  `activePackageRequired` BOOLEAN NOT NULL DEFAULT TRUE,
  `inactiveUplineAction` ENUM('LOST', 'PENDING', 'PASS_UP') NOT NULL DEFAULT 'LOST',
  `compressionMode` ENUM('SKIP', 'PASS_SAME_LEVEL', 'COMPRESS_LEVELS', 'PENDING') NOT NULL DEFAULT 'SKIP',
  `releaseMode` ENUM('IMMEDIATE', 'HOLD_PERIOD', 'MANUAL_APPROVAL', 'CONDITION_BASED') NOT NULL DEFAULT 'IMMEDIATE',
  `holdPeriodHours` INT NOT NULL DEFAULT 0,
  `effectiveFrom` DATETIME(3) NULL,
  `effectiveTo` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `clonedFromPlanVersionId` CHAR(36) NULL,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `publishedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `rc_plan_version_number_key` (`versionNumber`),
  INDEX `rc_plan_effective_idx` (`status`, `effectiveFrom`, `effectiveTo`),
  INDEX `rc_plan_clone_idx` (`clonedFromPlanVersionId`),
  INDEX `rc_plan_created_by_idx` (`createdByUserId`),
  INDEX `rc_plan_updated_by_idx` (`updatedByUserId`),
  INDEX `rc_plan_published_by_idx` (`publishedByUserId`),

  CONSTRAINT `rc_plan_clone_fkey`
    FOREIGN KEY (`clonedFromPlanVersionId`) REFERENCES `referral_commission_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_plan_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rc_plan_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rc_plan_published_by_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `rc_plan_revision_check` CHECK (`revision` > 0),
  CONSTRAINT `rc_plan_hold_hours_check` CHECK (`holdPeriodHours` >= 0),
  CONSTRAINT `rc_plan_effective_range_check` CHECK (
    `effectiveTo` IS NULL OR `effectiveFrom` IS NULL OR `effectiveTo` > `effectiveFrom`
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_commission_level_rules` (
  `id` CHAR(36) NOT NULL,
  `planVersionId` CHAR(36) NOT NULL,
  `level` INT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `ratePercent` DECIMAL(9,6) NOT NULL,
  `packageMatchingEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `rc_level_plan_level_key` (`planVersionId`, `level`),
  INDEX `rc_level_plan_enabled_idx` (`planVersionId`, `enabled`, `level`),

  CONSTRAINT `rc_level_plan_fkey`
    FOREIGN KEY (`planVersionId`) REFERENCES `referral_commission_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_level_number_check` CHECK (`level` > 0),
  CONSTRAINT `rc_level_rate_check` CHECK (`ratePercent` > 0 AND `ratePercent` <= 100)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_commission_runs` (
  `id` CHAR(36) NOT NULL,
  `sourceSubscriptionId` CHAR(36) NOT NULL,
  `sourceDepositId` CHAR(36) NOT NULL,
  `purchaserUserId` CHAR(36) NOT NULL,
  `commissionPlanVersionId` CHAR(36) NULL,
  `sourcePackageCode` VARCHAR(64) NOT NULL,
  `sourcePackageDisplayName` VARCHAR(100) NOT NULL,
  `sourcePackageValue` DECIMAL(20,8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `sourceActivatedAt` DATETIME(3) NOT NULL,
  `outcome` ENUM('PROCESSED', 'NO_EFFECTIVE_PLAN', 'NO_SPONSOR') NOT NULL,
  `routeSnapshot` JSON NULL,
  `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `rc_run_subscription_key` (`sourceSubscriptionId`),
  INDEX `rc_run_purchaser_idx` (`purchaserUserId`, `processedAt`),
  INDEX `rc_run_plan_idx` (`commissionPlanVersionId`),
  INDEX `rc_run_outcome_idx` (`outcome`, `processedAt`),

  CONSTRAINT `rc_run_subscription_fkey`
    FOREIGN KEY (`sourceSubscriptionId`) REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_run_deposit_fkey`
    FOREIGN KEY (`sourceDepositId`) REFERENCES `deposits`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_run_purchaser_fkey`
    FOREIGN KEY (`purchaserUserId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_run_plan_fkey`
    FOREIGN KEY (`commissionPlanVersionId`) REFERENCES `referral_commission_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_run_source_value_check` CHECK (`sourcePackageValue` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_commission_events` (
  `id` CHAR(36) NOT NULL,
  `runId` CHAR(36) NOT NULL,
  `sourceSubscriptionId` CHAR(36) NOT NULL,
  `receiverUserId` CHAR(36) NOT NULL,
  `purchaserUserId` CHAR(36) NOT NULL,
  `commissionPlanVersionId` CHAR(36) NOT NULL,
  `level` INT NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `sourcePackageValue` DECIMAL(20,8) NOT NULL,
  `receiverPackageBasis` DECIMAL(20,8) NOT NULL,
  `packageMatchingEnabled` BOOLEAN NOT NULL,
  `eligibleBase` DECIMAL(20,8) NOT NULL,
  `ratePercent` DECIMAL(9,6) NOT NULL,
  `commissionAmount` DECIMAL(20,8) NOT NULL,
  `releaseMode` ENUM('IMMEDIATE', 'HOLD_PERIOD', 'MANUAL_APPROVAL', 'CONDITION_BASED') NOT NULL,
  `status` ENUM('AVAILABLE', 'PENDING', 'LOST') NOT NULL,
  `ineligibilityReason` VARCHAR(100) NULL,
  `ledgerTransactionId` CHAR(36) NULL,
  `availableAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `rc_event_source_key` (`sourceKey`),
  UNIQUE INDEX `rc_event_run_level_key` (`runId`, `level`),
  UNIQUE INDEX `rc_event_ledger_key` (`ledgerTransactionId`),
  INDEX `rc_event_receiver_idx` (`receiverUserId`, `createdAt`),
  INDEX `rc_event_purchaser_idx` (`purchaserUserId`, `createdAt`),
  INDEX `rc_event_plan_idx` (`commissionPlanVersionId`),
  INDEX `rc_event_status_idx` (`status`, `createdAt`),

  CONSTRAINT `rc_event_run_fkey`
    FOREIGN KEY (`runId`) REFERENCES `referral_commission_runs`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_event_subscription_fkey`
    FOREIGN KEY (`sourceSubscriptionId`) REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_event_receiver_fkey`
    FOREIGN KEY (`receiverUserId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_event_purchaser_fkey`
    FOREIGN KEY (`purchaserUserId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_event_plan_fkey`
    FOREIGN KEY (`commissionPlanVersionId`) REFERENCES `referral_commission_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_event_ledger_fkey`
    FOREIGN KEY (`ledgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_event_level_check` CHECK (`level` > 0),
  CONSTRAINT `rc_event_source_value_check` CHECK (`sourcePackageValue` > 0),
  CONSTRAINT `rc_event_receiver_basis_check` CHECK (`receiverPackageBasis` >= 0),
  CONSTRAINT `rc_event_eligible_base_check` CHECK (`eligibleBase` >= 0),
  CONSTRAINT `rc_event_rate_check` CHECK (`ratePercent` > 0 AND `ratePercent` <= 100),
  CONSTRAINT `rc_event_amount_check` CHECK (`commissionAmount` >= 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the supplied reference figures as a DRAFT only. No financial effect until
-- SUPER_ADMIN explicitly publishes after review.
INSERT INTO `referral_commission_plan_versions` (
  `id`, `versionNumber`, `status`, `revision`, `firstPurchaseEnabled`,
  `newPurchaseEnabled`, `renewalEnabled`, `upgradeEnabled`, `upgradeBaseMode`,
  `activePackageRequired`, `inactiveUplineAction`, `compressionMode`,
  `releaseMode`, `holdPeriodHours`, `createdAt`, `updatedAt`
) VALUES (
  UUID(), 1, 'DRAFT', 1, TRUE,
  TRUE, FALSE, FALSE, 'INCREMENTAL',
  TRUE, 'LOST', 'SKIP',
  'IMMEDIATE', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);

INSERT INTO `referral_commission_level_rules` (
  `id`, `planVersionId`, `level`, `enabled`, `ratePercent`,
  `packageMatchingEnabled`, `createdAt`, `updatedAt`
)
SELECT UUID(), p.id, levels.level, TRUE, levels.ratePercent, TRUE,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `referral_commission_plan_versions` p
JOIN (
  SELECT 1 AS level, CAST('20.000000' AS DECIMAL(9,6)) AS ratePercent
  UNION ALL SELECT 2, CAST('8.000000' AS DECIMAL(9,6))
  UNION ALL SELECT 3, CAST('5.000000' AS DECIMAL(9,6))
  UNION ALL SELECT 4, CAST('3.000000' AS DECIMAL(9,6))
  UNION ALL SELECT 5, CAST('2.000000' AS DECIMAL(9,6))
) levels
WHERE p.versionNumber = 1;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'commissions.read', 'View referral commission plans, events and USER commission history', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'commissions.plan.manage', 'Create, edit and publish versioned referral commission plans', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'commissions.reconcile', 'Reconcile immutable package subscriptions into referral commission events', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
