-- ITD-01 — Internal Trading policy foundation.
-- Forward-only. SIM-01 remains display-only and financially inert.
-- V1 is DRAFT and therefore has zero financial effect until explicitly published.

CREATE TABLE `internal_trade_policy_versions` (
  `id` CHAR(36) NOT NULL,
  `versionNumber` INT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `revision` INT NOT NULL DEFAULT 1,

  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `activitiesPerDay` INT NOT NULL DEFAULT 5,

  `assetSymbols` JSON NOT NULL,
  `winWeight` INT NOT NULL,
  `lossWeight` INT NOT NULL,

  `winMinimumPercent` DECIMAL(9,6) NOT NULL,
  `winMaximumPercent` DECIMAL(9,6) NOT NULL,
  `lossMinimumPercent` DECIMAL(9,6) NOT NULL,
  `lossMaximumPercent` DECIMAL(9,6) NOT NULL,

  `timingWindows` JSON NOT NULL,

  `userSharePercent` DECIMAL(9,6) NOT NULL,
  `adminSharePercent` DECIMAL(9,6) NOT NULL,

  `timezoneSnapshot` VARCHAR(64) NULL,
  `effectiveFrom` DATETIME(3) NULL,
  `effectiveTo` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,

  `clonedFromPolicyVersionId` CHAR(36) NULL,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `publishedByUserId` CHAR(36) NULL,

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE INDEX `internal_trade_policy_version_key`
    (`versionNumber`),

  INDEX `internal_trade_policy_effective_idx`
    (`status`, `effectiveFrom`, `effectiveTo`),

  INDEX `internal_trade_policy_clone_idx`
    (`clonedFromPolicyVersionId`),

  CONSTRAINT `internal_trade_policy_clone_fkey`
    FOREIGN KEY (`clonedFromPolicyVersionId`)
    REFERENCES `internal_trade_policy_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_policy_created_by_fkey`
    FOREIGN KEY (`createdByUserId`)
    REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_policy_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`)
    REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_policy_published_by_fkey`
    FOREIGN KEY (`publishedByUserId`)
    REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `internal_trade_policy_revision_check`
    CHECK (`revision` > 0),

  CONSTRAINT `internal_trade_policy_activity_count_check`
    CHECK (`activitiesPerDay` >= 5 AND `activitiesPerDay` <= 100),

  CONSTRAINT `internal_trade_policy_weight_check`
    CHECK (
      `winWeight` >= 0
      AND `lossWeight` >= 0
      AND (`winWeight` + `lossWeight`) > 0
    ),

  CONSTRAINT `internal_trade_policy_win_range_check`
    CHECK (
      `winMinimumPercent` > 0
      AND `winMaximumPercent` >= `winMinimumPercent`
      AND `winMaximumPercent` <= 100
    ),

  CONSTRAINT `internal_trade_policy_loss_range_check`
    CHECK (
      `lossMinimumPercent` > 0
      AND `lossMaximumPercent` >= `lossMinimumPercent`
      AND `lossMaximumPercent` <= 100
    ),

  CONSTRAINT `internal_trade_policy_user_share_check`
    CHECK (
      `userSharePercent` >= 0
      AND `userSharePercent` <= 100
    ),

  CONSTRAINT `internal_trade_policy_admin_share_check`
    CHECK (
      `adminSharePercent` >= 0
      AND `adminSharePercent` <= 100
    ),

  CONSTRAINT `internal_trade_policy_split_check`
    CHECK (
      (`userSharePercent` + `adminSharePercent`) = 100
    ),

  CONSTRAINT `internal_trade_policy_effective_range_check`
    CHECK (
      `effectiveTo` IS NULL
      OR (
        `effectiveFrom` IS NOT NULL
        AND `effectiveTo` > `effectiveFrom`
      )
    ),

  CONSTRAINT `internal_trade_policy_publication_check`
    CHECK (
      `status` <> 'PUBLISHED'
      OR (
        `effectiveFrom` IS NOT NULL
        AND `publishedAt` IS NOT NULL
        AND `timezoneSnapshot` IS NOT NULL
      )
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- Initial safe configuration.
-- DRAFT => no execution / no ledger impact.
INSERT INTO `internal_trade_policy_versions` (
  `id`,
  `versionNumber`,
  `status`,
  `revision`,
  `enabled`,
  `activitiesPerDay`,
  `assetSymbols`,
  `winWeight`,
  `lossWeight`,
  `winMinimumPercent`,
  `winMaximumPercent`,
  `lossMinimumPercent`,
  `lossMaximumPercent`,
  `timingWindows`,
  `userSharePercent`,
  `adminSharePercent`,
  `createdAt`,
  `updatedAt`
) VALUES (
  UUID(),
  1,
  'DRAFT',
  1,
  TRUE,
  5,
  JSON_ARRAY('BTCUSDT', 'ETHUSDT', 'SOLUSDT'),
  3,
  2,
  0.500000,
  2.500000,
  0.250000,
  1.500000,
  JSON_ARRAY(
    JSON_OBJECT(
      'start', '09:00',
      'end', '21:00'
    )
  ),
  70.000000,
  30.000000,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);


INSERT IGNORE INTO `permissions` (
  `id`,
  `code`,
  `description`,
  `createdAt`,
  `updatedAt`
) VALUES
(
  UUID(),
  'internal_trading.read',
  'View internal trading policies, events and lifecycle state',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
),
(
  UUID(),
  'internal_trading.reconcile',
  'Reconcile internal trading lifecycle for eligible package subscriptions',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
);
