-- AWR-01 — package-based sequential Team Business Award & Reward foundation.
-- Forward-only. Existing package rewards/caps, referral, subscription and ledger
-- migrations remain immutable.
--
-- Locked business rules:
-- - Award & Reward is separate from Package Rewards & Caps.
-- - SUPER_ADMIN publishes a versioned package/level matrix.
-- - Number of genealogy levels is configurable per policy.
-- - NULL requiredBusiness means NOT_REQUIRED for that package/level.
-- - Exact genealogy levels are evaluated independently.
-- - Team business is sourced from successful package activations only.
-- - Multiple eligible ACTIVE packages run sequentially in configured trackOrder.
-- - The next package track starts from zero only after the previous track closes.
-- - Business counted for an earlier track is never carried into a later track.
-- - Each user/package-definition award is lifetime-idempotent.
-- - Award posting credits the existing USER REWARDS wallet bucket through a
--   dedicated double-entry ledger kind and expense account.

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
    'AWARD_REWARD_EXPENSE'
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
    'PAYOUT_SETTLEMENT',
    'PACKAGE_PRINCIPAL_RETURN',
    'AWARD_REWARD_CREDIT'
  ) NOT NULL;

CREATE TABLE `award_reward_policy_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `levelCount` INT NOT NULL DEFAULT 1,
  `asset` VARCHAR(10) NOT NULL DEFAULT 'USDT',
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
  UNIQUE INDEX `award_policy_version_key` (`versionNumber`),
  INDEX `award_policy_effective_idx` (`status`, `enabled`, `effectiveFrom`, `effectiveTo`),
  INDEX `award_policy_clone_idx` (`clonedFromPolicyVersionId`),
  INDEX `award_policy_created_idx` (`createdByUserId`),
  INDEX `award_policy_updated_idx` (`updatedByUserId`),
  INDEX `award_policy_published_idx` (`publishedByUserId`),

  CONSTRAINT `award_policy_clone_fkey`
    FOREIGN KEY (`clonedFromPolicyVersionId`) REFERENCES `award_reward_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_policy_created_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `award_policy_updated_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `award_policy_published_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `award_policy_revision_check` CHECK (`revision` > 0),
  CONSTRAINT `award_policy_level_count_check` CHECK (`levelCount` > 0),
  CONSTRAINT `award_policy_effective_range_check` CHECK (
    `effectiveTo` IS NULL OR (`effectiveFrom` IS NOT NULL AND `effectiveTo` > `effectiveFrom`)
  ),
  CONSTRAINT `award_policy_publication_check` CHECK (
    `status` <> 'PUBLISHED'
    OR (`effectiveFrom` IS NOT NULL AND `publishedAt` IS NOT NULL)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `award_reward_policy_tracks` (
  `id` CHAR(36) NOT NULL,
  `policyVersionId` CHAR(36) NOT NULL,
  `packageDefinitionId` CHAR(36) NOT NULL,
  `packageCodeSnapshot` VARCHAR(64) NOT NULL,
  `packageDisplayNameSnapshot` VARCHAR(100) NOT NULL,
  `trackOrder` INT NOT NULL,
  `awardAmount` DECIMAL(20,8) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `award_track_policy_package_key` (`policyVersionId`, `packageDefinitionId`),
  UNIQUE INDEX `award_track_policy_order_key` (`policyVersionId`, `trackOrder`),
  INDEX `award_track_package_idx` (`packageDefinitionId`),

  CONSTRAINT `award_track_policy_fkey`
    FOREIGN KEY (`policyVersionId`) REFERENCES `award_reward_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_track_package_fkey`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_track_order_check` CHECK (`trackOrder` > 0),
  CONSTRAINT `award_track_amount_check` CHECK (`awardAmount` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `award_reward_policy_levels` (
  `id` CHAR(36) NOT NULL,
  `policyTrackId` CHAR(36) NOT NULL,
  `levelNumber` INT NOT NULL,
  `requiredBusiness` DECIMAL(20,8) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `award_level_track_number_key` (`policyTrackId`, `levelNumber`),
  INDEX `award_level_number_idx` (`levelNumber`),

  CONSTRAINT `award_level_track_fkey`
    FOREIGN KEY (`policyTrackId`) REFERENCES `award_reward_policy_tracks`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_level_number_check` CHECK (`levelNumber` > 0),
  CONSTRAINT `award_level_business_check` CHECK (
    `requiredBusiness` IS NULL OR `requiredBusiness` > 0
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `award_reward_user_tracks` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `policyVersionId` CHAR(36) NOT NULL,
  `policyTrackId` CHAR(36) NOT NULL,
  `sourceSubscriptionId` CHAR(36) NOT NULL,
  `packageDefinitionId` CHAR(36) NOT NULL,
  `packageCodeSnapshot` VARCHAR(64) NOT NULL,
  `packageDisplayNameSnapshot` VARCHAR(100) NOT NULL,
  `trackOrder` INT NOT NULL,
  `awardAmount` DECIMAL(20,8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `levelCount` INT NOT NULL,
  `status` ENUM('ACTIVE_TRACK', 'QUALIFIED', 'AWARD_POSTED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE_TRACK',
  `startedAt` DATETIME(3) NOT NULL,
  `qualifiedAt` DATETIME(3) NULL,
  `awardPostedAt` DATETIME(3) NULL,
  `closedAt` DATETIME(3) NULL,
  `ledgerTransactionId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `award_user_package_lifetime_key` (`userId`, `packageDefinitionId`),
  UNIQUE INDEX `award_user_ledger_key` (`ledgerTransactionId`),
  INDEX `award_user_status_idx` (`userId`, `status`, `trackOrder`),
  INDEX `award_user_policy_idx` (`policyVersionId`),
  INDEX `award_user_track_idx` (`policyTrackId`),
  INDEX `award_user_subscription_idx` (`sourceSubscriptionId`),

  CONSTRAINT `award_user_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_user_policy_fkey`
    FOREIGN KEY (`policyVersionId`) REFERENCES `award_reward_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_user_policy_track_fkey`
    FOREIGN KEY (`policyTrackId`) REFERENCES `award_reward_policy_tracks`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_user_subscription_fkey`
    FOREIGN KEY (`sourceSubscriptionId`) REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_user_package_fkey`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_user_ledger_fkey`
    FOREIGN KEY (`ledgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_user_order_check` CHECK (`trackOrder` > 0),
  CONSTRAINT `award_user_amount_check` CHECK (`awardAmount` > 0),
  CONSTRAINT `award_user_level_count_check` CHECK (`levelCount` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `award_reward_user_level_progress` (
  `id` CHAR(36) NOT NULL,
  `userTrackId` CHAR(36) NOT NULL,
  `levelNumber` INT NOT NULL,
  `requiredBusiness` DECIMAL(20,8) NULL,
  `currentBusiness` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000,
  `achievedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `award_progress_track_level_key` (`userTrackId`, `levelNumber`),
  INDEX `award_progress_level_idx` (`levelNumber`, `achievedAt`),

  CONSTRAINT `award_progress_track_fkey`
    FOREIGN KEY (`userTrackId`) REFERENCES `award_reward_user_tracks`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_progress_level_check` CHECK (`levelNumber` > 0),
  CONSTRAINT `award_progress_required_check` CHECK (
    `requiredBusiness` IS NULL OR `requiredBusiness` > 0
  ),
  CONSTRAINT `award_progress_current_check` CHECK (`currentBusiness` >= 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `award_reward_events` (
  `id` CHAR(36) NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `userTrackId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `policyVersionId` CHAR(36) NOT NULL,
  `packageDefinitionId` CHAR(36) NOT NULL,
  `packageCodeSnapshot` VARCHAR(64) NOT NULL,
  `packageDisplayNameSnapshot` VARCHAR(100) NOT NULL,
  `awardAmount` DECIMAL(20,8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `levelProgressSnapshot` JSON NOT NULL,
  `ledgerTransactionId` CHAR(36) NOT NULL,
  `postedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `award_event_source_key` (`sourceKey`),
  UNIQUE INDEX `award_event_user_track_key` (`userTrackId`),
  UNIQUE INDEX `award_event_ledger_key` (`ledgerTransactionId`),
  INDEX `award_event_user_idx` (`userId`, `postedAt`),
  INDEX `award_event_policy_idx` (`policyVersionId`),
  INDEX `award_event_package_idx` (`packageDefinitionId`, `postedAt`),

  CONSTRAINT `award_event_user_track_fkey`
    FOREIGN KEY (`userTrackId`) REFERENCES `award_reward_user_tracks`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_event_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_event_policy_fkey`
    FOREIGN KEY (`policyVersionId`) REFERENCES `award_reward_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_event_package_fkey`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_event_ledger_fkey`
    FOREIGN KEY (`ledgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `award_event_amount_check` CHECK (`awardAmount` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'award_rewards.read', 'View Award & Reward policies, team-business progress and award history', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'award_rewards.manage', 'Create, edit and publish versioned Award & Reward policies', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'award_rewards.reconcile', 'Run idempotent sequential team-business Award & Reward reconciliation', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
