-- WAL-01 forward migration: configurable approved-deposit accounting posting policy.
-- 0010 is already applied history and remains immutable.

CREATE TABLE `system_accounting_config` (
  `id` INT NOT NULL DEFAULT 1,
  `depositPostingMode` ENUM('AUTO_ON_APPROVAL', 'MANUAL_RECONCILIATION') NOT NULL DEFAULT 'AUTO_ON_APPROVAL',
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `system_accounting_config_updatedByUserId_idx` (`updatedByUserId`),
  CONSTRAINT `system_accounting_config_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_accounting_config` (
  `id`,
  `depositPostingMode`,
  `updatedByUserId`,
  `createdAt`,
  `updatedAt`
) VALUES (
  1,
  'AUTO_ON_APPROVAL',
  NULL,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);
