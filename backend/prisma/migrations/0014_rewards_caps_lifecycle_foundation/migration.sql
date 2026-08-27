-- RWD-01 — package rewards / cap / lifecycle accounting foundation.
-- Forward-only. Existing WAL/SUB/COMM migrations remain immutable.
-- Reward policy V1 is seeded DRAFT: no automatic financial effect until rollout
-- policy is explicitly locked and published.

ALTER TABLE `ledger_accounts`
  MODIFY `bucket` ENUM(
    'MAIN',
    'PACKAGE_EARNINGS',
    'REFERRAL_COMMISSION',
    'REWARDS',
    'DEPOSIT_CLEARING',
    'PACKAGE_PRINCIPAL',
    'REFERRAL_COMMISSION_EXPENSE',
    'PACKAGE_REWARD_EXPENSE'
  ) NOT NULL;

ALTER TABLE `ledger_transactions`
  MODIFY `kind` ENUM(
    'DEPOSIT_CREDIT',
    'PACKAGE_ACTIVATION_FUNDING',
    'REFERRAL_COMMISSION_CREDIT',
    'PACKAGE_REWARD_CREDIT'
  ) NOT NULL;

CREATE TABLE `reward_cap_policy_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,
  `existingSubscriptionRolloutMode` ENUM(
    'RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE',
    'FORWARD_ONLY_FROM_POLICY_EFFECTIVE'
  ) NOT NULL DEFAULT 'FORWARD_ONLY_FROM_POLICY_EFFECTIVE',
  `packageRewardCountsTowardCap` BOOLEAN NOT NULL DEFAULT TRUE,
  `referralCommissionCountsTowardCap` BOOLEAN NOT NULL DEFAULT FALSE,
  `teamCommissionCountsTowardCap` BOOLEAN NOT NULL DEFAULT FALSE,
  `awardRewardCountsTowardCap` BOOLEAN NOT NULL DEFAULT FALSE,
  `otherIncomeCountsTowardCap` BOOLEAN NOT NULL DEFAULT FALSE,
  `effectiveFrom` DATETIME(3) NULL,
  `effectiveTo` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `publishedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `reward_cap_policy_version_key` (`versionNumber`),
  INDEX `reward_cap_policy_effective_idx` (`status`, `effectiveFrom`, `effectiveTo`),
  INDEX `reward_cap_policy_created_by_idx` (`createdByUserId`),
  INDEX `reward_cap_policy_updated_by_idx` (`updatedByUserId`),
  INDEX `reward_cap_policy_published_by_idx` (`publishedByUserId`),

  CONSTRAINT `reward_cap_policy_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `reward_cap_policy_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `reward_cap_policy_published_by_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `reward_cap_policy_revision_check` CHECK (`revision` > 0),
  CONSTRAINT `reward_cap_policy_effective_range_check` CHECK (
    `effectiveTo` IS NULL OR (`effectiveFrom` IS NOT NULL AND `effectiveTo` > `effectiveFrom`)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `package_reward_states` (
  `subscriptionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `rewardCapPolicyVersionId` CHAR(36) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `packageValue` DECIMAL(20,8) NOT NULL,
  `capBasis` VARCHAR(40) NOT NULL,
  `capMultiplier` DECIMAL(10,4) NOT NULL,
  `principalTreatment` VARCHAR(50) NOT NULL,
  `capLimit` DECIMAL(20,8) NOT NULL,
  `capConsumed` DECIMAL(20,8) NOT NULL,
  `packageRewardCountsTowardCap` BOOLEAN NOT NULL,
  `referralCommissionCountsTowardCap` BOOLEAN NOT NULL,
  `teamCommissionCountsTowardCap` BOOLEAN NOT NULL,
  `awardRewardCountsTowardCap` BOOLEAN NOT NULL,
  `otherIncomeCountsTowardCap` BOOLEAN NOT NULL,
  `nextRewardLocalDate` DATE NOT NULL,
  `nextRewardAt` DATETIME(3) NOT NULL,
  `rewardDayNumber` INT NOT NULL DEFAULT 0,
  `cycleNumber` INT NOT NULL DEFAULT 1,
  `cycleDay` INT NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE', 'COMPLETED', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  `completionReason` ENUM('CAP_REACHED', 'LIFETIME_REACHED') NULL,
  `blockedReason` VARCHAR(120) NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`subscriptionId`),
  INDEX `package_reward_state_user_idx` (`userId`, `status`, `nextRewardAt`),
  INDEX `package_reward_state_due_idx` (`status`, `nextRewardAt`),
  INDEX `package_reward_state_policy_idx` (`rewardCapPolicyVersionId`),

  CONSTRAINT `package_reward_state_subscription_fkey`
    FOREIGN KEY (`subscriptionId`) REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_state_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_state_policy_fkey`
    FOREIGN KEY (`rewardCapPolicyVersionId`) REFERENCES `reward_cap_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_state_package_value_check` CHECK (`packageValue` > 0),
  CONSTRAINT `package_reward_state_cap_limit_check` CHECK (`capLimit` > 0),
  CONSTRAINT `package_reward_state_cap_consumed_check` CHECK (`capConsumed` >= 0 AND `capConsumed` <= `capLimit`),
  CONSTRAINT `package_reward_state_day_check` CHECK (`rewardDayNumber` >= 0 AND `cycleNumber` > 0 AND `cycleDay` >= 0),
  CONSTRAINT `package_reward_state_revision_check` CHECK (`revision` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `package_reward_events` (
  `id` CHAR(36) NOT NULL,
  `sourceKey` VARCHAR(191) NOT NULL,
  `subscriptionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `rewardCapPolicyVersionId` CHAR(36) NOT NULL,
  `packagePlanVersionId` CHAR(36) NOT NULL,
  `packagePlanItemId` CHAR(36) NOT NULL,
  `packageCode` VARCHAR(64) NOT NULL,
  `packageDisplayName` VARCHAR(100) NOT NULL,
  `packageValue` DECIMAL(20,8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `rewardLocalDate` DATE NOT NULL,
  `rewardDayNumber` INT NOT NULL,
  `cycleNumber` INT NOT NULL,
  `cycleDay` INT NOT NULL,
  `rewardRateMode` VARCHAR(40) NOT NULL,
  `rewardRateMeaning` VARCHAR(40) NOT NULL,
  `selectedRate` DECIMAL(9,6) NOT NULL,
  `calculatedReward` DECIMAL(20,8) NOT NULL,
  `postedReward` DECIMAL(20,8) NOT NULL,
  `capBasis` VARCHAR(40) NOT NULL,
  `capMultiplier` DECIMAL(10,4) NOT NULL,
  `principalTreatment` VARCHAR(50) NOT NULL,
  `capLimit` DECIMAL(20,8) NOT NULL,
  `capConsumedBefore` DECIMAL(20,8) NOT NULL,
  `capConsumedAfter` DECIMAL(20,8) NOT NULL,
  `clippedToCap` BOOLEAN NOT NULL DEFAULT FALSE,
  `cycleDays` INT NOT NULL,
  `goalDays` INT NOT NULL,
  `cycleEndAction` VARCHAR(50) NOT NULL,
  `capReachedAction` VARCHAR(50) NOT NULL,
  `ledgerTransactionId` CHAR(36) NOT NULL,
  `completionReason` ENUM('CAP_REACHED', 'LIFETIME_REACHED') NULL,
  `postedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `package_reward_event_source_key` (`sourceKey`),
  UNIQUE INDEX `package_reward_event_subscription_date_key` (`subscriptionId`, `rewardLocalDate`),
  UNIQUE INDEX `package_reward_event_ledger_key` (`ledgerTransactionId`),
  INDEX `package_reward_event_user_idx` (`userId`, `postedAt`),
  INDEX `package_reward_event_policy_idx` (`rewardCapPolicyVersionId`),
  INDEX `package_reward_event_subscription_idx` (`subscriptionId`, `postedAt`),

  CONSTRAINT `package_reward_event_subscription_fkey`
    FOREIGN KEY (`subscriptionId`) REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_event_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_event_policy_fkey`
    FOREIGN KEY (`rewardCapPolicyVersionId`) REFERENCES `reward_cap_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_event_ledger_fkey`
    FOREIGN KEY (`ledgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_reward_event_package_value_check` CHECK (`packageValue` > 0),
  CONSTRAINT `package_reward_event_rate_check` CHECK (`selectedRate` > 0 AND `selectedRate` <= 100),
  CONSTRAINT `package_reward_event_calculated_check` CHECK (`calculatedReward` > 0),
  CONSTRAINT `package_reward_event_posted_check` CHECK (`postedReward` > 0 AND `postedReward` <= `calculatedReward`),
  CONSTRAINT `package_reward_event_cap_check` CHECK (
    `capConsumedBefore` >= 0
    AND `capConsumedAfter` >= `capConsumedBefore`
    AND `capConsumedAfter` <= `capLimit`
  ),
  CONSTRAINT `package_reward_event_day_check` CHECK (
    `rewardDayNumber` > 0 AND `cycleNumber` > 0 AND `cycleDay` > 0
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Approved R54 cap-contribution snapshot, intentionally DRAFT until Q58 rollout
-- behavior is locked and SUPER_ADMIN publication is available.
INSERT INTO `reward_cap_policy_versions` (
  `id`, `versionNumber`, `status`, `revision`, `existingSubscriptionRolloutMode`,
  `packageRewardCountsTowardCap`, `referralCommissionCountsTowardCap`,
  `teamCommissionCountsTowardCap`, `awardRewardCountsTowardCap`,
  `otherIncomeCountsTowardCap`, `createdAt`, `updatedAt`
) VALUES (
  UUID(), 1, 'DRAFT', 1, 'FORWARD_ONLY_FROM_POLICY_EFFECTIVE',
  TRUE, FALSE, FALSE, FALSE, FALSE,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'rewards.read', 'View package reward events, cap state and lifecycle progress', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'rewards.reconcile', 'Reconcile due package rewards through the authoritative reward engine', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
