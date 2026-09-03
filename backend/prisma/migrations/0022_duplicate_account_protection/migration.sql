-- CLIENT-REVISION — Duplicate-account / one-person-one-account protection.
-- Forward-only. Existing migrations remain immutable.
-- Device installation ID is the strong duplicate-risk signal.
-- IP remains supporting metadata and never blocks by itself.

ALTER TABLE `users`
  MODIFY `status` ENUM(
    'ACTIVE',
    'RESTRICTED',
    'SUSPENDED',
    'BLOCKED',
    'PENDING'
  ) NOT NULL DEFAULT 'PENDING';

CREATE TABLE `system_duplicate_account_config` (
  `id` INT NOT NULL DEFAULT 1,
  `enforcementMode` ENUM('OFF', 'MONITOR', 'RESTRICT', 'BLOCK') NOT NULL DEFAULT 'OFF',
  `deviceSignalEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `ipSignalEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `dup_cfg_updated_by_idx` (`updatedByUserId`),

  CONSTRAINT `dup_cfg_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `duplicate_account_allowlist` (
  `id` CHAR(36) NOT NULL,
  `type` ENUM('DEVICE_INSTALLATION_ID', 'IP_ADDRESS') NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  `label` VARCHAR(100) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `dup_allow_type_value_key` (`type`, `value`),
  INDEX `dup_allow_active_idx` (`type`, `isActive`),
  INDEX `dup_allow_created_by_idx` (`createdByUserId`),

  CONSTRAINT `dup_allow_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_device_installations` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `installationId` VARCHAR(64) NOT NULL,
  `firstSeenIp` VARCHAR(45) NULL,
  `lastSeenIp` VARCHAR(45) NULL,
  `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_device_user_installation_key` (`userId`, `installationId`),
  INDEX `user_device_installation_idx` (`installationId`),
  INDEX `user_device_last_ip_idx` (`lastSeenIp`),

  CONSTRAINT `user_device_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `duplicate_account_risk_events` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NULL,
  `attemptedEmail` VARCHAR(191) NULL,
  `installationId` VARCHAR(64) NULL,
  `ipAddress` VARCHAR(45) NULL,
  `enforcementMode` ENUM('OFF', 'MONITOR', 'RESTRICT', 'BLOCK') NOT NULL,
  `action` ENUM('ALLOWED', 'MONITORED', 'RESTRICTED', 'BLOCKED', 'BYPASSED') NOT NULL,
  `bypassType` ENUM('DEVICE_INSTALLATION_ID', 'IP_ADDRESS') NULL,
  `matchedUserIds` JSON NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `dup_risk_user_idx` (`userId`, `createdAt`),
  INDEX `dup_risk_installation_idx` (`installationId`, `createdAt`),
  INDEX `dup_risk_ip_idx` (`ipAddress`, `createdAt`),
  INDEX `dup_risk_action_idx` (`action`, `createdAt`),

  CONSTRAINT `dup_risk_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_duplicate_account_config` (
  `id`,
  `enforcementMode`,
  `deviceSignalEnabled`,
  `ipSignalEnabled`,
  `updatedByUserId`
)
VALUES (1, 'OFF', TRUE, TRUE, NULL)
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);
