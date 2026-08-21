CREATE TABLE `system_security_config` (
  `id` INT NOT NULL DEFAULT 1,
  `fullUserImpersonationEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `idleLockMinutes` INT NOT NULL DEFAULT 5,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  INDEX `system_security_config_updatedByUserId_idx`
    (`updatedByUserId`),

  CONSTRAINT `system_security_config_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT `system_security_config_singleton_check`
    CHECK (`id` = 1),

  CONSTRAINT `system_security_config_idle_lock_minutes_check`
    CHECK (`idleLockMinutes` BETWEEN 1 AND 120)
)
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_security_config` (
  `id`,
  `fullUserImpersonationEnabled`,
  `idleLockMinutes`,
  `createdAt`,
  `updatedAt`
)
VALUES (
  1,
  FALSE,
  5,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
  `id` = VALUES(`id`);
