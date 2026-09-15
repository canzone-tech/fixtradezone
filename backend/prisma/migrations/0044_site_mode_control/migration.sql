-- SITE-MODE-01: one-click platform mode controls public access and automation.
-- Existing package/deposit/commission/trading/reward configuration remains
-- authoritative and is not rewritten by a mode transition.

ALTER TABLE `system_operations_config`
  ADD COLUMN `siteMode` ENUM('LIVE', 'TESTING', 'MAINTENANCE') NOT NULL DEFAULT 'LIVE' AFTER `operationsMode`,
  ADD COLUMN `modeMessage` VARCHAR(500) NULL AFTER `siteMode`,
  ADD COLUMN `launchAt` DATETIME(3) NULL AFTER `modeMessage`,
  ADD COLUMN `recoveryUnlockedUntil` DATETIME(3) NULL AFTER `launchAt`,
  ADD COLUMN `recoveryReason` VARCHAR(500) NULL AFTER `recoveryUnlockedUntil`;

-- Preserve an installation that was deliberately left in Controlled Manual by
-- mapping that state to TESTING. AUTOMATIC installations remain LIVE.
UPDATE `system_operations_config`
SET `siteMode` = CASE
  WHEN `operationsMode` = 'CONTROLLED_MANUAL' THEN 'TESTING'
  ELSE 'LIVE'
END
WHERE `id` = 1;

CREATE TABLE `site_mode_testers` (
  `userId` CHAR(36) NOT NULL,
  `note` VARCHAR(500) NULL,
  `createdByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`userId`),
  INDEX `site_mode_testers_createdByUserId_idx` (`createdByUserId`),
  CONSTRAINT `site_mode_testers_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `site_mode_testers_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
