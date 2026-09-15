-- COMM-02 — configurable referral commission level depth.
-- Forward-only migration. Existing published COMM-01 plan terms and events remain immutable.

CREATE TABLE `referral_commission_package_depth_rules` (
  `id` CHAR(36) NOT NULL,
  `planVersionId` CHAR(36) NOT NULL,
  `packageDefinitionId` CHAR(36) NOT NULL,
  `packageCodeSnapshot` VARCHAR(64) NOT NULL,
  `packageDisplayNameSnapshot` VARCHAR(100) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `maxLevelDepth` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `rc_depth_plan_package_key` (`planVersionId`, `packageDefinitionId`),
  INDEX `rc_depth_plan_enabled_idx` (`planVersionId`, `enabled`, `maxLevelDepth`),
  INDEX `rc_depth_package_idx` (`packageDefinitionId`),

  CONSTRAINT `rc_depth_plan_fkey`
    FOREIGN KEY (`planVersionId`) REFERENCES `referral_commission_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_depth_package_fkey`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `rc_depth_level_check` CHECK (`maxLevelDepth` >= 5 AND `maxLevelDepth` <= 100)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
