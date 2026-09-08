-- SIM-01 — display-only simulated trade activity.
-- Forward-only. This migration creates no wallet/ledger/reward/commission mutations.
-- Policy V1 is seeded DRAFT and therefore produces no simulated events until
-- SUPER_ADMIN explicitly publishes it. Published policies execute only from a
-- local calendar-day boundary so one local day does not silently mix versions.

CREATE TABLE `simulated_activity_policy_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `activitiesPerDay` INT NOT NULL DEFAULT 5,
  `assetSymbols` JSON NOT NULL,
  `winWeight` INT NOT NULL DEFAULT 3,
  `lossWeight` INT NOT NULL DEFAULT 2,
  `winMinimumPercent` DECIMAL(9,6) NOT NULL DEFAULT 0.500000,
  `winMaximumPercent` DECIMAL(9,6) NOT NULL DEFAULT 2.500000,
  `lossMinimumPercent` DECIMAL(9,6) NOT NULL DEFAULT 0.250000,
  `lossMaximumPercent` DECIMAL(9,6) NOT NULL DEFAULT 1.500000,
  `timingWindows` JSON NOT NULL,
  `timezoneSnapshot` VARCHAR(64) NULL,
  `effectiveFrom` DATETIME(3) NULL,
  `effectiveTo` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `clonedFromPolicyVersionId` CHAR(36) NULL,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `publishedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `sim_activity_policy_version_key` (`versionNumber`),
  INDEX `sim_activity_policy_effective_idx` (`status`, `effectiveFrom`, `effectiveTo`),
  INDEX `sim_activity_policy_clone_idx` (`clonedFromPolicyVersionId`),
  INDEX `sim_activity_policy_created_by_idx` (`createdByUserId`),
  INDEX `sim_activity_policy_updated_by_idx` (`updatedByUserId`),
  INDEX `sim_activity_policy_published_by_idx` (`publishedByUserId`),

  CONSTRAINT `sim_activity_policy_clone_fkey`
    FOREIGN KEY (`clonedFromPolicyVersionId`) REFERENCES `simulated_activity_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_policy_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_policy_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_policy_published_by_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_policy_revision_check` CHECK (`revision` > 0),
  CONSTRAINT `sim_activity_policy_daily_check` CHECK (`activitiesPerDay` BETWEEN 1 AND 50),
  CONSTRAINT `sim_activity_policy_weight_check` CHECK (
    `winWeight` >= 0 AND `lossWeight` >= 0 AND (`winWeight` + `lossWeight`) > 0
  ),
  CONSTRAINT `sim_activity_policy_win_range_check` CHECK (
    `winMinimumPercent` > 0
    AND `winMaximumPercent` >= `winMinimumPercent`
    AND `winMaximumPercent` <= 100
  ),
  CONSTRAINT `sim_activity_policy_loss_range_check` CHECK (
    `lossMinimumPercent` > 0
    AND `lossMaximumPercent` >= `lossMinimumPercent`
    AND `lossMaximumPercent` <= 100
  ),
  CONSTRAINT `sim_activity_policy_effective_range_check` CHECK (
    `effectiveTo` IS NULL OR (`effectiveFrom` IS NOT NULL AND `effectiveTo` > `effectiveFrom`)
  ),
  CONSTRAINT `sim_activity_policy_publication_check` CHECK (
    `status` <> 'PUBLISHED'
    OR (`effectiveFrom` IS NOT NULL AND `publishedAt` IS NOT NULL AND `timezoneSnapshot` IS NOT NULL)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `simulated_trade_activity_events` (
  `id` CHAR(36) NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `subscriptionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `policyVersionId` CHAR(36) NOT NULL,
  `packagePlanVersionId` CHAR(36) NOT NULL,
  `packagePlanItemId` CHAR(36) NOT NULL,
  `packageCode` VARCHAR(64) NOT NULL,
  `packageDisplayName` VARCHAR(100) NOT NULL,
  `localActivityDate` DATE NOT NULL,
  `slotNumber` INT NOT NULL,
  `scheduledAt` DATETIME(3) NOT NULL,
  `timezoneSnapshot` VARCHAR(64) NOT NULL,
  `assetSymbol` VARCHAR(32) NOT NULL,
  `outcome` ENUM('WIN', 'LOSS') NOT NULL,
  `resultPercent` DECIMAL(9,6) NOT NULL,
  `generationSource` ENUM('WORKER', 'RECONCILIATION') NOT NULL,
  `generatedByUserId` CHAR(36) NULL,
  `generatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `sim_activity_event_source_key` (`sourceKey`),
  UNIQUE INDEX `sim_activity_event_subscription_policy_slot_key` (`subscriptionId`, `policyVersionId`, `localActivityDate`, `slotNumber`),
  INDEX `sim_activity_event_user_idx` (`userId`, `scheduledAt`),
  INDEX `sim_activity_event_subscription_idx` (`subscriptionId`, `scheduledAt`),
  INDEX `sim_activity_event_policy_idx` (`policyVersionId`),
  INDEX `sim_activity_event_due_idx` (`localActivityDate`, `scheduledAt`),
  INDEX `sim_activity_event_generated_by_idx` (`generatedByUserId`),

  CONSTRAINT `sim_activity_event_subscription_fkey`
    FOREIGN KEY (`subscriptionId`) REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_event_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_event_policy_fkey`
    FOREIGN KEY (`policyVersionId`) REFERENCES `simulated_activity_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_event_generated_by_fkey`
    FOREIGN KEY (`generatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `sim_activity_event_slot_check` CHECK (`slotNumber` > 0),
  CONSTRAINT `sim_activity_event_result_check` CHECK (
    (`outcome` = 'WIN' AND `resultPercent` > 0 AND `resultPercent` <= 100)
    OR (`outcome` = 'LOSS' AND `resultPercent` < 0 AND `resultPercent` >= -100)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `simulated_activity_policy_versions` (
  `id`, `versionNumber`, `status`, `revision`, `enabled`, `activitiesPerDay`,
  `assetSymbols`, `winWeight`, `lossWeight`,
  `winMinimumPercent`, `winMaximumPercent`,
  `lossMinimumPercent`, `lossMaximumPercent`,
  `timingWindows`, `createdAt`, `updatedAt`
) VALUES (
  UUID(), 1, 'DRAFT', 1, TRUE, 5,
  JSON_ARRAY('BTCUSDT', 'ETHUSDT', 'SOLUSDT'),
  3, 2,
  0.500000, 2.500000,
  0.250000, 1.500000,
  JSON_ARRAY(JSON_OBJECT('start', '09:00', 'end', '21:00')),
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'simulated_activity.read', 'View simulated trade activity policies, events and generator health', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'simulated_activity.reconcile', 'Run idempotent simulated activity reconciliation for eligible subscriptions', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
