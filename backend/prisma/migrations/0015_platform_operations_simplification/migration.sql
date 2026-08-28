-- OPS-01: one SUPER_ADMIN operations mode plus one platform timezone.
-- Existing immutable financial history remains untouched. This configuration
-- only controls future orchestration and display/operational scheduling policy.

CREATE TABLE `system_operations_config` (
  `id` INT NOT NULL DEFAULT 1,
  `platformTimezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `operationsMode` ENUM('AUTOMATIC', 'CONTROLLED_MANUAL') NOT NULL DEFAULT 'AUTOMATIC',
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `system_operations_config_updatedByUserId_idx` (`updatedByUserId`),
  CONSTRAINT `system_operations_config_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `system_operations_config_singleton_chk`
    CHECK (`id` = 1),
  CONSTRAINT `system_operations_config_timezone_chk`
    CHECK (CHAR_LENGTH(TRIM(`platformTimezone`)) BETWEEN 1 AND 64)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve an explicitly selected legacy accounting mode when upgrading, while
-- making AUTOMATIC the safe default when no accounting config row is present.
INSERT INTO `system_operations_config` (
  `id`,
  `platformTimezone`,
  `operationsMode`,
  `updatedByUserId`,
  `createdAt`,
  `updatedAt`
)
SELECT
  1,
  'Asia/Kolkata',
  CASE
    WHEN sac.`depositPostingMode` = 'MANUAL_RECONCILIATION' THEN 'CONTROLLED_MANUAL'
    ELSE 'AUTOMATIC'
  END,
  sac.`updatedByUserId`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `system_accounting_config` sac
WHERE sac.`id` = 1
UNION ALL
SELECT
  1,
  'Asia/Kolkata',
  'AUTOMATIC',
  NULL,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `system_accounting_config` WHERE `id` = 1
)
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);
