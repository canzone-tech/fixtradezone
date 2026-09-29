-- Per-user device limit overrides for duplicate-account login protection.
-- Forward-only. Default USER behavior remains one device when no override exists.

CREATE TABLE `duplicate_account_user_device_policies` (
  `userId` CHAR(36) NOT NULL,
  `maxDevices` INT NOT NULL DEFAULT 1,
  `label` VARCHAR(100) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`userId`),
  INDEX `dup_user_device_policy_updated_by_idx` (`updatedByUserId`),

  CONSTRAINT `dup_user_device_policy_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT `dup_user_device_policy_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT `dup_user_device_policy_max_devices_chk`
    CHECK (`maxDevices` >= 1 AND `maxDevices` <= 5)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
