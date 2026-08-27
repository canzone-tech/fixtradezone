-- FixTradeZone PKG-01 package/plan foundation.
-- Founder-approved decisions: Q33-Q39 Option A and the approved V1 safe defaults.
-- This migration installs catalogue configuration only. It creates no purchase,
-- activation, balance, earning, cap-consumption, deposit or ledger records.

CREATE TABLE `package_definitions` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `package_definitions_code_key` (`code`),
  CONSTRAINT `package_definitions_code_check`
    CHECK (CHAR_LENGTH(TRIM(`code`)) BETWEEN 3 AND 64)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `package_plan_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,
  `activePackageMode` ENUM('SINGLE_ACTIVE','MULTIPLE_ACTIVE') NOT NULL DEFAULT 'SINGLE_ACTIVE',
  `multipleActivePackageBasis` ENUM('HIGHEST_ACTIVE_PACKAGE','TOTAL_ACTIVE_PACKAGE_VALUE','PRIMARY_PACKAGE') NOT NULL DEFAULT 'HIGHEST_ACTIVE_PACKAGE',
  `activationTrigger` ENUM('PAYMENT_SUBMITTED','PAYMENT_APPROVED','MANUAL_ACTIVATION','RULE_BASED') NOT NULL DEFAULT 'PAYMENT_APPROVED',
  `migrationMode` ENUM('NEW_ENROLLMENTS_ONLY','NEW_PACKAGE_ACTIVATIONS','ALL_FUTURE_EVENTS','EFFECTIVE_DATE') NOT NULL DEFAULT 'NEW_PACKAGE_ACTIVATIONS',
  `renewalMode` ENUM('MANUAL_AFTER_TERMINAL','AUTO_RENEWAL','DISABLED') NOT NULL DEFAULT 'MANUAL_AFTER_TERMINAL',
  `upgradesEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `settlementTimezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
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
  UNIQUE INDEX `package_plan_versions_versionNumber_key` (`versionNumber`),
  INDEX `package_plan_versions_status_effective_range_idx` (`status`,`effectiveFrom`,`effectiveTo`),
  INDEX `package_plan_versions_clonedFrom_idx` (`clonedFromPlanVersionId`),
  INDEX `package_plan_versions_createdBy_idx` (`createdByUserId`),
  INDEX `package_plan_versions_updatedBy_idx` (`updatedByUserId`),
  INDEX `package_plan_versions_publishedBy_idx` (`publishedByUserId`),
  CONSTRAINT `package_plan_versions_clonedFrom_fkey`
    FOREIGN KEY (`clonedFromPlanVersionId`) REFERENCES `package_plan_versions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_plan_versions_createdBy_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `package_plan_versions_updatedBy_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `package_plan_versions_publishedBy_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `package_plan_versions_version_check` CHECK (`versionNumber` >= 1),
  CONSTRAINT `package_plan_versions_revision_check` CHECK (`revision` >= 1),
  CONSTRAINT `package_plan_versions_timezone_check`
    CHECK (CHAR_LENGTH(TRIM(`settlementTimezone`)) BETWEEN 1 AND 64),
  CONSTRAINT `package_plan_versions_effective_range_check`
    CHECK (`effectiveTo` IS NULL OR (`effectiveFrom` IS NOT NULL AND `effectiveTo` > `effectiveFrom`)),
  CONSTRAINT `package_plan_versions_publication_check`
    CHECK (
      `status` <> 'PUBLISHED'
      OR (`effectiveFrom` IS NOT NULL AND `publishedAt` IS NOT NULL)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `package_plan_items` (
  `id` CHAR(36) NOT NULL,
  `planVersionId` CHAR(36) NOT NULL,
  `packageDefinitionId` CHAR(36) NOT NULL,
  `displayName` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `sortOrder` INT NOT NULL,
  `availability` ENUM('AVAILABLE','HIDDEN','CLOSED_TO_NEW_ACTIVATIONS') NOT NULL DEFAULT 'AVAILABLE',
  `price` DECIMAL(20,8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `rewardRateMode` ENUM('FIXED','RANDOM_RANGE','MANUAL','RULE_BASED') NOT NULL,
  `fixedRewardRate` DECIMAL(9,6) NULL,
  `minimumRewardRate` DECIMAL(9,6) NULL,
  `maximumRewardRate` DECIMAL(9,6) NULL,
  `rewardRateMeaning` ENUM('GROSS_BEFORE_SPLIT','USER_NET_AFTER_SPLIT') NOT NULL,
  `capBasis` ENUM('TOTAL_RETURN','PROFIT_ONLY') NOT NULL,
  `capMultiplier` DECIMAL(10,4) NOT NULL,
  `principalTreatment` ENUM('RETURN_SEPARATELY','INCLUDED_IN_TOTAL_RETURN','NON_REFUNDABLE_PACKAGE_VALUE') NOT NULL,
  `goalDays` INT NOT NULL,
  `cycleDays` INT NOT NULL,
  `rewardStartMode` ENUM('SAME_DAY','NEXT_CALENDAR_DAY','AFTER_FULL_INTERVAL','CONFIGURED_START_TIME','NEXT_CYCLE_START') NOT NULL,
  `rewardFrequency` ENUM('DAILY_CALENDAR','CONFIGURED_DAYS','PER_CYCLE','PER_EVENT') NOT NULL,
  `cycleDayMode` ENUM('CALENDAR_DAYS','ELIGIBLE_EARNING_DAYS') NOT NULL,
  `rewardDayMode` ENUM('EVERY_DAY','SELECTED_WEEKDAYS','CUSTOM_CALENDAR') NOT NULL,
  `cycleEndAction` ENUM('COMPLETE_PACKAGE','AUTO_START_NEXT_CYCLE','MANUAL_RESTART','PAUSE_UNTIL_CONDITION') NOT NULL,
  `capReachedAction` ENUM('COMPLETE_PACKAGE','STOP_EARNINGS_KEEP_ACTIVE','AUTO_RENEW','MANUAL_RENEW','PAUSE') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `package_plan_items_plan_definition_key` (`planVersionId`,`packageDefinitionId`),
  UNIQUE INDEX `package_plan_items_plan_slug_key` (`planVersionId`,`slug`),
  UNIQUE INDEX `package_plan_items_plan_sort_key` (`planVersionId`,`sortOrder`),
  INDEX `package_plan_items_packageDefinitionId_idx` (`packageDefinitionId`),
  INDEX `package_plan_items_plan_availability_sort_idx` (`planVersionId`,`availability`,`sortOrder`),
  CONSTRAINT `package_plan_items_planVersionId_fkey`
    FOREIGN KEY (`planVersionId`) REFERENCES `package_plan_versions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_plan_items_packageDefinitionId_fkey`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `package_plan_items_display_name_check`
    CHECK (CHAR_LENGTH(TRIM(`displayName`)) BETWEEN 1 AND 100),
  CONSTRAINT `package_plan_items_slug_check`
    CHECK (CHAR_LENGTH(TRIM(`slug`)) BETWEEN 1 AND 100),
  CONSTRAINT `package_plan_items_sort_order_check` CHECK (`sortOrder` >= 1),
  CONSTRAINT `package_plan_items_price_check` CHECK (`price` > 0),
  CONSTRAINT `package_plan_items_currency_check` CHECK (`currency` = 'USDT'),
  CONSTRAINT `package_plan_items_rate_shape_check`
    CHECK (
      (
        `rewardRateMode` = 'FIXED'
        AND `fixedRewardRate` IS NOT NULL
        AND `minimumRewardRate` IS NULL
        AND `maximumRewardRate` IS NULL
      )
      OR
      (
        `rewardRateMode` IN ('RANDOM_RANGE','MANUAL','RULE_BASED')
        AND `fixedRewardRate` IS NULL
        AND `minimumRewardRate` IS NOT NULL
        AND `maximumRewardRate` IS NOT NULL
        AND `minimumRewardRate` <= `maximumRewardRate`
      )
    ),
  CONSTRAINT `package_plan_items_fixed_rate_check`
    CHECK (`fixedRewardRate` IS NULL OR (`fixedRewardRate` > 0 AND `fixedRewardRate` <= 100)),
  CONSTRAINT `package_plan_items_min_rate_check`
    CHECK (`minimumRewardRate` IS NULL OR (`minimumRewardRate` > 0 AND `minimumRewardRate` <= 100)),
  CONSTRAINT `package_plan_items_max_rate_check`
    CHECK (`maximumRewardRate` IS NULL OR (`maximumRewardRate` > 0 AND `maximumRewardRate` <= 100)),
  CONSTRAINT `package_plan_items_cap_multiplier_check`
    CHECK (
      `capMultiplier` > 0
      AND (
        `capBasis` <> 'TOTAL_RETURN'
        OR `principalTreatment` <> 'INCLUDED_IN_TOTAL_RETURN'
        OR `capMultiplier` >= 1
      )
    ),
  CONSTRAINT `package_plan_items_duration_check`
    CHECK (`goalDays` >= 1 AND `cycleDays` >= 1 AND `cycleDays` <= `goalDays`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Stable package identities. Commercial terms live only in plan items.
INSERT INTO `package_definitions` (`id`, `code`) VALUES
  ('1fb18eca-8ada-4e13-9942-fd876b744a43', 'NEURAL_SCOUT'),
  ('36331074-e9b3-4e5c-be8b-407114e46931', 'NEURAL_VOYAGER'),
  ('db6e2c4a-9677-45d3-81e1-03695cfa3610', 'NEURAL_NAVIGATOR'),
  ('e263dfdb-c84b-4a1e-aff7-212952b3109b', 'NEURAL_STRATEGIST'),
  ('c56ee589-98a2-4717-839f-ca312fc9228a', 'QUANT_CORE'),
  ('2f4ce7f5-e9b8-4d82-9e77-824dfe128559', 'QUANT_PRIME'),
  ('91a23803-fce8-46c5-ac45-7bf7d884431f', 'QUANT_APEX'),
  ('faf35ff5-3027-47db-92c2-fa397790baf6', 'QUANT_TITAN'),
  ('b6b21ccd-8411-458c-bd30-6e1e180f3c7d', 'QUANT_SOVEREIGN');

-- V1 is intentionally DRAFT. SUPER_ADMIN must review and publish it explicitly.
INSERT INTO `package_plan_versions` (
  `id`, `versionNumber`, `status`, `revision`, `activePackageMode`,
  `multipleActivePackageBasis`, `activationTrigger`, `migrationMode`,
  `renewalMode`, `upgradesEnabled`, `settlementTimezone`
) VALUES (
  '27f2c796-9313-4fe5-bbff-3d9ce365976e', 1, 'DRAFT', 1,
  'SINGLE_ACTIVE', 'HIGHEST_ACTIVE_PACKAGE', 'PAYMENT_APPROVED',
  'NEW_PACKAGE_ACTIVATIONS', 'MANUAL_AFTER_TERMINAL', FALSE, 'UTC'
);

INSERT INTO `package_plan_items` (
  `id`, `planVersionId`, `packageDefinitionId`, `displayName`, `slug`,
  `sortOrder`, `availability`, `price`, `currency`, `rewardRateMode`,
  `fixedRewardRate`, `minimumRewardRate`, `maximumRewardRate`,
  `rewardRateMeaning`, `capBasis`, `capMultiplier`, `principalTreatment`,
  `goalDays`, `cycleDays`, `rewardStartMode`, `rewardFrequency`,
  `cycleDayMode`, `rewardDayMode`, `cycleEndAction`, `capReachedAction`
) VALUES
  ('1558e235-cb8d-4348-89ae-6210562514aa', '27f2c796-9313-4fe5-bbff-3d9ce365976e', '1fb18eca-8ada-4e13-9942-fd876b744a43', 'Neural Scout', 'neural-scout', 1, 'AVAILABLE', 5.00000000, 'USDT', 'RANDOM_RANGE', NULL, 0.400000, 0.600000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 2.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 10, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('31357350-e0aa-4c30-8fcd-a4f14c0e3f39', '27f2c796-9313-4fe5-bbff-3d9ce365976e', '36331074-e9b3-4e5c-be8b-407114e46931', 'Neural Voyager', 'neural-voyager', 2, 'AVAILABLE', 25.00000000, 'USDT', 'RANDOM_RANGE', NULL, 0.500000, 0.700000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 2.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 15, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('45ddd75e-68ba-4fb6-b31c-3751900fb518', '27f2c796-9313-4fe5-bbff-3d9ce365976e', 'db6e2c4a-9677-45d3-81e1-03695cfa3610', 'Neural Navigator', 'neural-navigator', 3, 'AVAILABLE', 50.00000000, 'USDT', 'RANDOM_RANGE', NULL, 0.600000, 0.800000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 2.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 20, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('878841e2-a350-42df-a58c-ba57ef3d8127', '27f2c796-9313-4fe5-bbff-3d9ce365976e', 'e263dfdb-c84b-4a1e-aff7-212952b3109b', 'Neural Strategist', 'neural-strategist', 4, 'AVAILABLE', 100.00000000, 'USDT', 'RANDOM_RANGE', NULL, 0.700000, 0.900000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 2.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 25, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('e2781190-c462-4313-adbc-abf3a7dcdfbd', '27f2c796-9313-4fe5-bbff-3d9ce365976e', 'c56ee589-98a2-4717-839f-ca312fc9228a', 'Quant Core', 'quant-core', 5, 'AVAILABLE', 500.00000000, 'USDT', 'RANDOM_RANGE', NULL, 0.800000, 1.000000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 3.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 30, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('f995a172-8a2a-4a9e-b860-dcd9b4d0ea3b', '27f2c796-9313-4fe5-bbff-3d9ce365976e', '2f4ce7f5-e9b8-4d82-9e77-824dfe128559', 'Quant Prime', 'quant-prime', 6, 'AVAILABLE', 1000.00000000, 'USDT', 'RANDOM_RANGE', NULL, 0.900000, 1.200000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 3.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 60, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('d248e7c4-8166-45d4-a193-ee00fad89b20', '27f2c796-9313-4fe5-bbff-3d9ce365976e', '91a23803-fce8-46c5-ac45-7bf7d884431f', 'Quant Apex', 'quant-apex', 7, 'AVAILABLE', 2000.00000000, 'USDT', 'RANDOM_RANGE', NULL, 1.000000, 1.500000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 3.0000, 'INCLUDED_IN_TOTAL_RETURN', 90, 90, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('e7ed3df0-59f1-4050-bf5b-fbcb46743f91', '27f2c796-9313-4fe5-bbff-3d9ce365976e', 'faf35ff5-3027-47db-92c2-fa397790baf6', 'Quant Titan', 'quant-titan', 8, 'AVAILABLE', 4000.00000000, 'USDT', 'RANDOM_RANGE', NULL, 1.100000, 1.800000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 4.0000, 'INCLUDED_IN_TOTAL_RETURN', 150, 120, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE'),
  ('b70bce68-815c-466b-8c8b-87a8e540b383', '27f2c796-9313-4fe5-bbff-3d9ce365976e', 'b6b21ccd-8411-458c-bd30-6e1e180f3c7d', 'Quant Sovereign', 'quant-sovereign', 9, 'AVAILABLE', 5000.00000000, 'USDT', 'RANDOM_RANGE', NULL, 1.200000, 2.000000, 'USER_NET_AFTER_SPLIT', 'TOTAL_RETURN', 4.0000, 'INCLUDED_IN_TOTAL_RETURN', 150, 150, 'NEXT_CALENDAR_DAY', 'DAILY_CALENDAR', 'CALENDAR_DAYS', 'EVERY_DAY', 'AUTO_START_NEXT_CYCLE', 'COMPLETE_PACKAGE');

INSERT INTO `audit_logs` (
  `id`, `actorUserId`, `action`, `entityType`, `entityId`, `description`, `metadata`
) VALUES (
  '2a18f34b-253d-4f1f-8026-9b329479f56e',
  NULL,
  'CREATE',
  'PackagePlanVersion',
  '27f2c796-9313-4fe5-bbff-3d9ce365976e',
  'Migration installed the Founder-approved initial package-plan draft.',
  JSON_OBJECT(
    'source', 'MIGRATION_0007_PACKAGE_PLAN_FOUNDATION',
    'operation', 'SEED_INITIAL_DRAFT',
    'versionNumber', 1,
    'revision', 1,
    'itemCount', 9,
    'status', 'DRAFT'
  )
);
