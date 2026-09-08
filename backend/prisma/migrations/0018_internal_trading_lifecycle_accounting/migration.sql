-- ITD-02 — Internal Trading package lifecycle + accounting foundation.
--
-- Forward-only.
-- 0017 remains immutable.
--
-- Business rules:
-- - internal trading is package/subscription based
-- - multiple ACTIVE subscriptions may operate independently
-- - global trades/day policy, minimum 5
-- - no package/admin trades/day override
-- - gross target = principal * package multiplier
-- - USER/ADMIN split is snapshotted at package activation
-- - daily WIN/LOSS affects gross progress
-- - only new gross high-water creates financial settlement
-- - historical events are immutable/idempotent
-- - existing subscriptions remain LEGACY_REWARD unless explicitly enrolled
-- - no silent historical backfill / double-credit


-- ============================================================
-- 1. REMOVE UNAPPROVED ARBITRARY 100 TRADES/DAY MAXIMUM
--    Minimum 5 remains locked.
-- ============================================================

ALTER TABLE `internal_trade_policy_versions`
  DROP CHECK `internal_trade_policy_activity_count_check`;

ALTER TABLE `internal_trade_policy_versions`
  ADD CONSTRAINT `internal_trade_policy_activity_count_check`
  CHECK (`activitiesPerDay` >= 5);


-- ============================================================
-- 2. LEDGER ENUM EXTENSIONS
-- ============================================================

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
    'INTERNAL_TRADING_ADMIN_PROFIT'
  ) NOT NULL;


ALTER TABLE `ledger_transactions`
  MODIFY `kind` ENUM(
    'DEPOSIT_CREDIT',
    'PACKAGE_ACTIVATION_FUNDING',
    'REFERRAL_COMMISSION_CREDIT',
    'PACKAGE_REWARD_CREDIT',
    'INTERNAL_TRADING_SETTLEMENT'
  ) NOT NULL;


-- ============================================================
-- 3. PACKAGE SUBSCRIPTION EARNING AUTHORITY + SPLIT SNAPSHOT
--
-- Existing subscriptions intentionally remain LEGACY_REWARD.
-- New activation code will explicitly select INTERNAL_TRADING
-- only when a published/effective ITD policy applies.
-- ============================================================

ALTER TABLE `user_package_subscriptions`
  ADD COLUMN `earningAuthority`
    ENUM('LEGACY_REWARD', 'INTERNAL_TRADING')
    NOT NULL DEFAULT 'LEGACY_REWARD'
    AFTER `settlementTimezone`,

  ADD COLUMN `internalTradeSplitPolicyVersionId`
    CHAR(36) NULL
    AFTER `earningAuthority`,

  ADD COLUMN `internalTradeUserSharePercent`
    DECIMAL(9,6) NULL
    AFTER `internalTradeSplitPolicyVersionId`,

  ADD COLUMN `internalTradeAdminSharePercent`
    DECIMAL(9,6) NULL
    AFTER `internalTradeUserSharePercent`;


ALTER TABLE `user_package_subscriptions`
  ADD INDEX `ups_earning_authority_idx`
    (`earningAuthority`, `status`, `activatedAt`),

  ADD INDEX `ups_internal_trade_policy_idx`
    (`internalTradeSplitPolicyVersionId`);


ALTER TABLE `user_package_subscriptions`
  ADD CONSTRAINT `ups_internal_trade_policy_fkey`
    FOREIGN KEY (`internalTradeSplitPolicyVersionId`)
    REFERENCES `internal_trade_policy_versions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;


ALTER TABLE `user_package_subscriptions`
  ADD CONSTRAINT `ups_internal_trade_snapshot_check`
  CHECK (
    (
      `earningAuthority` = 'LEGACY_REWARD'
      AND `internalTradeUserSharePercent` IS NULL
      AND `internalTradeAdminSharePercent` IS NULL
    )
    OR
    (
      `earningAuthority` = 'INTERNAL_TRADING'
      AND `internalTradeUserSharePercent` IS NOT NULL
      AND `internalTradeAdminSharePercent` IS NOT NULL
      AND `internalTradeUserSharePercent` >= 0
      AND `internalTradeUserSharePercent` <= 100
      AND `internalTradeAdminSharePercent` >= 0
      AND `internalTradeAdminSharePercent` <= 100
      AND (
        `internalTradeUserSharePercent`
        + `internalTradeAdminSharePercent`
      ) = 100
    )
  );


-- ============================================================
-- 4. AUTHORITATIVE PACKAGE TRADING STATE
-- ============================================================

CREATE TABLE `internal_trade_subscription_states` (
  `subscriptionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,

  `splitPolicyVersionId` CHAR(36) NOT NULL,

  `packagePlanVersionId` CHAR(36) NOT NULL,
  `packagePlanItemId` CHAR(36) NOT NULL,
  `packageCode` VARCHAR(64) NOT NULL,
  `packageDisplayName` VARCHAR(100) NOT NULL,

  `currency` VARCHAR(10) NOT NULL,

  `principalAmount` DECIMAL(20,8) NOT NULL,
  `grossMultiplier` DECIMAL(10,4) NOT NULL,
  `grossTarget` DECIMAL(20,8) NOT NULL,

  `userSharePercent` DECIMAL(9,6) NOT NULL,
  `adminSharePercent` DECIMAL(9,6) NOT NULL,

  `timezoneSnapshot` VARCHAR(64) NOT NULL,

  `activationLocalDate` DATE NOT NULL,
  `finalLocalDate` DATE NOT NULL,

  `grossNetProgress` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `grossHighWaterMark` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `userCreditedAmount` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `adminRecognizedAmount` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `nextTradeLocalDate` DATE NOT NULL,

  `settledTradeCount` INT
    NOT NULL DEFAULT 0,

  `status`
    ENUM('ACTIVE', 'COMPLETED', 'BLOCKED')
    NOT NULL DEFAULT 'ACTIVE',

  `completionReason`
    ENUM('TARGET_REACHED_AT_DURATION_END')
    NULL,

  `blockedReason` VARCHAR(191) NULL,

  `revision` INT NOT NULL DEFAULT 1,

  `completedAt` DATETIME(3) NULL,

  `createdAt` DATETIME(3)
    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  `updatedAt` DATETIME(3)
    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`subscriptionId`),

  INDEX `internal_trade_state_user_idx`
    (`userId`, `status`, `nextTradeLocalDate`),

  INDEX `internal_trade_state_due_idx`
    (`status`, `nextTradeLocalDate`),

  INDEX `internal_trade_state_split_policy_idx`
    (`splitPolicyVersionId`),

  CONSTRAINT `internal_trade_state_subscription_fkey`
    FOREIGN KEY (`subscriptionId`)
    REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_state_user_fkey`
    FOREIGN KEY (`userId`)
    REFERENCES `users`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_state_policy_fkey`
    FOREIGN KEY (`splitPolicyVersionId`)
    REFERENCES `internal_trade_policy_versions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_state_principal_check`
    CHECK (`principalAmount` > 0),

  CONSTRAINT `internal_trade_state_multiplier_check`
    CHECK (`grossMultiplier` > 0),

  CONSTRAINT `internal_trade_state_target_check`
    CHECK (`grossTarget` > 0),

  CONSTRAINT `internal_trade_state_dates_check`
    CHECK (`finalLocalDate` >= `activationLocalDate`),

  CONSTRAINT `internal_trade_state_split_check`
    CHECK (
      `userSharePercent` >= 0
      AND `userSharePercent` <= 100
      AND `adminSharePercent` >= 0
      AND `adminSharePercent` <= 100
      AND (`userSharePercent` + `adminSharePercent`) = 100
    ),

  CONSTRAINT `internal_trade_state_progress_check`
    CHECK (`grossNetProgress` <= `grossTarget`),

  CONSTRAINT `internal_trade_state_high_water_check`
    CHECK (
      `grossHighWaterMark` >= 0
      AND `grossHighWaterMark` <= `grossTarget`
    ),

  CONSTRAINT `internal_trade_state_credit_check`
    CHECK (
      `userCreditedAmount` >= 0
      AND `adminRecognizedAmount` >= 0
    ),

  CONSTRAINT `internal_trade_state_count_check`
    CHECK (`settledTradeCount` >= 0),

  CONSTRAINT `internal_trade_state_revision_check`
    CHECK (`revision` > 0),

  CONSTRAINT `internal_trade_state_completion_check`
    CHECK (
      (
        `status` = 'COMPLETED'
        AND `completionReason` IS NOT NULL
        AND `completedAt` IS NOT NULL
      )
      OR
      (
        `status` <> 'COMPLETED'
        AND `completionReason` IS NULL
        AND `completedAt` IS NULL
      )
    )
) DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;


-- ============================================================
-- 5. IMMUTABLE INTERNAL TRADE EVENTS
--
-- One subscription + local date + slot may exist only once,
-- regardless of policy version.
-- This prevents mixed/replayed same-day slot generation.
-- ============================================================

CREATE TABLE `internal_trade_events` (
  `id` CHAR(36) NOT NULL,

  `sourceKey` VARCHAR(191) NOT NULL,

  `subscriptionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,

  `policyVersionId` CHAR(36) NOT NULL,

  `packagePlanVersionId` CHAR(36) NOT NULL,
  `packagePlanItemId` CHAR(36) NOT NULL,
  `packageCode` VARCHAR(64) NOT NULL,
  `packageDisplayName` VARCHAR(100) NOT NULL,

  `currency` VARCHAR(10) NOT NULL,

  `grossTarget` DECIMAL(20,8) NOT NULL,

  `localTradeDate` DATE NOT NULL,
  `tradeDayNumber` INT NOT NULL,
  `slotNumber` INT NOT NULL,

  `scheduledAt` DATETIME(3) NOT NULL,
  `timezoneSnapshot` VARCHAR(64) NOT NULL,

  `assetSymbol` VARCHAR(32) NOT NULL,

  `outcome`
    ENUM('WIN', 'LOSS')
    NOT NULL,

  `resultPercent` DECIMAL(9,6) NOT NULL,

  `grossResultAmount` DECIMAL(20,8) NOT NULL,

  `grossProgressBefore` DECIMAL(20,8) NOT NULL,
  `grossProgressAfter` DECIMAL(20,8) NOT NULL,

  `grossHighWaterBefore` DECIMAL(20,8) NOT NULL,
  `grossHighWaterAfter` DECIMAL(20,8) NOT NULL,

  `grossSettlementAmount` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `userShareAmount` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `adminShareAmount` DECIMAL(20,8)
    NOT NULL DEFAULT 0.00000000,

  `ledgerTransactionId` CHAR(36) NULL,

  `generationSource`
    ENUM('WORKER', 'RECONCILIATION')
    NOT NULL,

  `generatedByUserId` CHAR(36) NULL,

  `generatedAt` DATETIME(3) NOT NULL,

  `createdAt` DATETIME(3)
    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE INDEX `internal_trade_event_source_key`
    (`sourceKey`),

  UNIQUE INDEX `internal_trade_event_subscription_slot_key`
    (`subscriptionId`, `localTradeDate`, `slotNumber`),

  UNIQUE INDEX `internal_trade_event_ledger_key`
    (`ledgerTransactionId`),

  INDEX `internal_trade_event_user_idx`
    (`userId`, `scheduledAt`),

  INDEX `internal_trade_event_subscription_idx`
    (`subscriptionId`, `scheduledAt`),

  INDEX `internal_trade_event_policy_idx`
    (`policyVersionId`),

  INDEX `internal_trade_event_due_idx`
    (`localTradeDate`, `scheduledAt`),

  INDEX `internal_trade_event_generated_by_idx`
    (`generatedByUserId`),

  CONSTRAINT `internal_trade_event_subscription_fkey`
    FOREIGN KEY (`subscriptionId`)
    REFERENCES `user_package_subscriptions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_event_user_fkey`
    FOREIGN KEY (`userId`)
    REFERENCES `users`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_event_policy_fkey`
    FOREIGN KEY (`policyVersionId`)
    REFERENCES `internal_trade_policy_versions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_event_ledger_fkey`
    FOREIGN KEY (`ledgerTransactionId`)
    REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_event_generated_by_fkey`
    FOREIGN KEY (`generatedByUserId`)
    REFERENCES `users`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_event_day_check`
    CHECK (
      `tradeDayNumber` > 0
      AND `slotNumber` > 0
    ),

  CONSTRAINT `internal_trade_event_target_check`
    CHECK (`grossTarget` > 0),

  CONSTRAINT `internal_trade_event_result_check`
    CHECK (
      (
        `outcome` = 'WIN'
        AND `resultPercent` > 0
        AND `resultPercent` <= 100
        AND `grossResultAmount` > 0
      )
      OR
      (
        `outcome` = 'LOSS'
        AND `resultPercent` < 0
        AND `resultPercent` >= -100
        AND `grossResultAmount` < 0
      )
    ),

  CONSTRAINT `internal_trade_event_progress_check`
    CHECK (`grossProgressAfter` <= `grossTarget`),

  CONSTRAINT `internal_trade_event_high_water_check`
    CHECK (
      `grossHighWaterBefore` >= 0
      AND `grossHighWaterAfter` >= `grossHighWaterBefore`
      AND `grossHighWaterAfter` <= `grossTarget`
    ),

  CONSTRAINT `internal_trade_event_settlement_check`
    CHECK (
      `grossSettlementAmount` >= 0
      AND `grossSettlementAmount`
        = (`grossHighWaterAfter` - `grossHighWaterBefore`)
      AND `userShareAmount` >= 0
      AND `adminShareAmount` >= 0
      AND (`userShareAmount` + `adminShareAmount`)
        = `grossSettlementAmount`
    ),

  CONSTRAINT `internal_trade_event_settlement_nonnegative_check`
    CHECK (`grossSettlementAmount` >= 0)
) DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
