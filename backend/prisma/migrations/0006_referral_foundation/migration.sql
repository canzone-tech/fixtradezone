-- FixTradeZone MLM-01 referral/sponsor foundation.
-- Existing-user rollout: LEAVE_UNASSIGNED_FOR_REVIEW.
-- No historical sponsor relationships are backfilled by this migration.

CREATE TABLE `referral_profiles` (
  `userId` CHAR(36) NOT NULL,
  `referralCode` VARCHAR(64) NOT NULL,
  `sponsorUserId` CHAR(36) NULL,
  `assignmentStatus` ENUM('ROOT','ASSIGNED','UNASSIGNED') NOT NULL DEFAULT 'UNASSIGNED',
  `assignedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`),
  UNIQUE INDEX `referral_profiles_referralCode_key` (`referralCode`),
  INDEX `referral_profiles_sponsorUserId_idx` (`sponsorUserId`),
  INDEX `referral_profiles_assignmentStatus_idx` (`assignmentStatus`),
  INDEX `referral_profiles_createdAt_idx` (`createdAt`),
  CONSTRAINT `referral_profiles_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `referral_profiles_sponsorUserId_fkey`
    FOREIGN KEY (`sponsorUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `referral_profiles_no_self_sponsor_check`
    CHECK (`sponsorUserId` IS NULL OR `sponsorUserId` <> `userId`),
  CONSTRAINT `referral_profiles_assignment_state_check`
    CHECK (
      (`assignmentStatus` IN ('ROOT','UNASSIGNED') AND `sponsorUserId` IS NULL)
      OR (`assignmentStatus` = 'ASSIGNED' AND `sponsorUserId` IS NOT NULL)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `referral_sponsor_history` (
  `id` CHAR(36) NOT NULL,
  `memberUserId` CHAR(36) NOT NULL,
  `oldSponsorUserId` CHAR(36) NULL,
  `newSponsorUserId` CHAR(36) NULL,
  `changedByUserId` CHAR(36) NULL,
  `source` ENUM('REGISTRATION','DEFAULT_SPONSOR','MANUAL_ASSIGNMENT','MANUAL_REASSIGNMENT','MIGRATION','ROOT_CONFIGURATION') NOT NULL,
  `reason` VARCHAR(500) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `referral_sponsor_history_memberUserId_createdAt_idx` (`memberUserId`,`createdAt`),
  INDEX `referral_sponsor_history_oldSponsorUserId_idx` (`oldSponsorUserId`),
  INDEX `referral_sponsor_history_newSponsorUserId_idx` (`newSponsorUserId`),
  INDEX `referral_sponsor_history_changedByUserId_idx` (`changedByUserId`),
  INDEX `referral_sponsor_history_source_idx` (`source`),
  CONSTRAINT `referral_sponsor_history_memberUserId_fkey`
    FOREIGN KEY (`memberUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `referral_sponsor_history_oldSponsorUserId_fkey`
    FOREIGN KEY (`oldSponsorUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `referral_sponsor_history_newSponsorUserId_fkey`
    FOREIGN KEY (`newSponsorUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `referral_sponsor_history_changedByUserId_fkey`
    FOREIGN KEY (`changedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `referral_sponsor_history_no_self_sponsor_check`
    CHECK (
      (`oldSponsorUserId` IS NULL OR `oldSponsorUserId` <> `memberUserId`)
      AND (`newSponsorUserId` IS NULL OR `newSponsorUserId` <> `memberUserId`)
    ),
  CONSTRAINT `referral_sponsor_history_distinct_sponsors_check`
    CHECK (`oldSponsorUserId` IS NULL OR `newSponsorUserId` IS NULL OR `oldSponsorUserId` <> `newSponsorUserId`),
  CONSTRAINT `referral_sponsor_history_manual_reason_check`
    CHECK (
      `source` NOT IN ('MANUAL_ASSIGNMENT','MANUAL_REASSIGNMENT')
      OR (`reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`reason`)) BETWEEN 1 AND 500)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `system_referral_config` (
  `id` INT NOT NULL DEFAULT 1,
  `enrollmentEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `existingUserMigrationMode` ENUM('ASSIGN_DEFAULT_SPONSOR','LEAVE_UNASSIGNED_FOR_REVIEW','REQUIRE_EXPLICIT_MAPPING') NOT NULL DEFAULT 'LEAVE_UNASSIGNED_FOR_REVIEW',
  `referralCodeMode` ENUM('SYSTEM_RANDOM','USERNAME','CUSTOM_PREFIX_RANDOM','CUSTOM_PATTERN') NOT NULL DEFAULT 'SYSTEM_RANDOM',
  `referralCodePrefix` VARCHAR(20) NULL,
  `referralCodePattern` VARCHAR(100) NULL,
  `adminSponsorChangeEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `primaryRootUserId` CHAR(36) NULL,
  `defaultSponsorUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `system_referral_config_primaryRootUserId_idx` (`primaryRootUserId`),
  INDEX `system_referral_config_defaultSponsorUserId_idx` (`defaultSponsorUserId`),
  INDEX `system_referral_config_updatedByUserId_idx` (`updatedByUserId`),
  CONSTRAINT `system_referral_config_primaryRootUserId_fkey`
    FOREIGN KEY (`primaryRootUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `system_referral_config_defaultSponsorUserId_fkey`
    FOREIGN KEY (`defaultSponsorUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `system_referral_config_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `system_referral_config_singleton_check` CHECK (`id` = 1),
  CONSTRAINT `system_referral_config_enablement_check`
    CHECK (`enrollmentEnabled` = FALSE OR (`primaryRootUserId` IS NOT NULL AND `defaultSponsorUserId` IS NOT NULL)),
  CONSTRAINT `system_referral_config_prefix_check`
    CHECK (`referralCodeMode` <> 'CUSTOM_PREFIX_RANDOM' OR (`referralCodePrefix` IS NOT NULL AND CHAR_LENGTH(TRIM(`referralCodePrefix`)) BETWEEN 1 AND 20)),
  CONSTRAINT `system_referral_config_pattern_check`
    CHECK (`referralCodeMode` <> 'CUSTOM_PATTERN' OR (`referralCodePattern` IS NOT NULL AND CHAR_LENGTH(TRIM(`referralCodePattern`)) BETWEEN 1 AND 100))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_referral_config`
  (`id`,`enrollmentEnabled`,`existingUserMigrationMode`,`referralCodeMode`,`adminSponsorChangeEnabled`,`createdAt`,`updatedAt`)
VALUES
  (1,FALSE,'LEAVE_UNASSIGNED_FOR_REVIEW','SYSTEM_RANDOM',FALSE,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3));
