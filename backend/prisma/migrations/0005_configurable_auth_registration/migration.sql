-- FixTradeZone configurable authentication and registration foundation.
-- Username remains the canonical unique account handle.
-- Email/mobile uniqueness is policy-driven:
--   SINGLE-account mode uses user_identifier_claims as uniqueness locks.
--   MULTI-account mode permits shared email/mobile and does not create claims
--   for the corresponding identifier type.
-- Typed singleton configuration is managed by SUPER_ADMIN.

ALTER TABLE `users`
  ADD COLUMN `phoneVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT FALSE;

-- Every account must have a canonical unique username.
-- Existing accounts without one receive a deterministic, collision-safe value.
UPDATE `users`
SET `username` = CONCAT('u_', REPLACE(`id`, '-', ''))
WHERE `username` IS NULL OR TRIM(`username`) = '';

ALTER TABLE `users`
  MODIFY COLUMN `email` VARCHAR(191) NULL,
  MODIFY COLUMN `username` VARCHAR(100) NOT NULL;

-- Email/mobile uniqueness becomes policy-driven instead of hard-coded.
ALTER TABLE `users`
  DROP INDEX `users_email_key`,
  DROP INDEX `users_phone_key`,
  ADD INDEX `users_email_idx` (`email`),
  ADD INDEX `users_phone_idx` (`phone`);

CREATE TABLE `user_identifier_claims` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `type` ENUM('EMAIL', 'MOBILE') NOT NULL,
  `normalizedValue` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  UNIQUE INDEX `user_identifier_claims_type_normalizedValue_key`
    (`type`, `normalizedValue`),

  INDEX `user_identifier_claims_userId_type_idx`
    (`userId`, `type`),

  CONSTRAINT `user_identifier_claims_userId_fkey`
    FOREIGN KEY (`userId`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
)
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- Seed currently unique email/mobile identifiers as SINGLE-account claims.
INSERT INTO `user_identifier_claims`
  (`id`, `userId`, `type`, `normalizedValue`, `createdAt`)
SELECT
  UUID(),
  `id`,
  'EMAIL',
  LOWER(TRIM(`email`)),
  CURRENT_TIMESTAMP(3)
FROM `users`
WHERE `email` IS NOT NULL AND TRIM(`email`) <> '';

INSERT INTO `user_identifier_claims`
  (`id`, `userId`, `type`, `normalizedValue`, `createdAt`)
SELECT
  UUID(),
  `id`,
  'MOBILE',
  TRIM(`phone`),
  CURRENT_TIMESTAMP(3)
FROM `users`
WHERE `phone` IS NOT NULL AND TRIM(`phone`) <> '';

CREATE TABLE `system_auth_config` (
  `id` INT NOT NULL DEFAULT 1,
  `loginWithUsername` BOOLEAN NOT NULL DEFAULT TRUE,
  `loginWithEmail` BOOLEAN NOT NULL DEFAULT TRUE,
  `loginWithMobile` BOOLEAN NOT NULL DEFAULT TRUE,
  `captchaOnLoginEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `captchaOnRegistrationEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  INDEX `system_auth_config_updatedByUserId_idx`
    (`updatedByUserId`),

  CONSTRAINT `system_auth_config_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT `system_auth_config_singleton_check`
    CHECK (`id` = 1),

  CONSTRAINT `system_auth_config_login_method_check`
    CHECK (
      `loginWithUsername` = TRUE OR
      `loginWithEmail` = TRUE OR
      `loginWithMobile` = TRUE
    )
)
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE TABLE `system_registration_config` (
  `id` INT NOT NULL DEFAULT 1,
  `publicRegistrationEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `superAdminRegistrationEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `adminRegistrationEnabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `authorizedUserRegistrationEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `emailRequired` BOOLEAN NOT NULL DEFAULT TRUE,
  `mobileRequired` BOOLEAN NOT NULL DEFAULT FALSE,
  `passwordMode` ENUM('AUTO', 'MANUAL', 'AUTO_OR_MANUAL')
    NOT NULL DEFAULT 'MANUAL',
  `usernameMode` ENUM('AUTO', 'MANUAL', 'AUTO_OR_MANUAL')
    NOT NULL DEFAULT 'AUTO_OR_MANUAL',
  `usernamePrefixEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `usernamePrefix` VARCHAR(20) NULL,
  `allowMultipleAccountsPerEmail` BOOLEAN NOT NULL DEFAULT FALSE,
  `allowMultipleAccountsPerMobile` BOOLEAN NOT NULL DEFAULT FALSE,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),

  INDEX `system_registration_config_updatedByUserId_idx`
    (`updatedByUserId`),

  CONSTRAINT `system_registration_config_updatedByUserId_fkey`
    FOREIGN KEY (`updatedByUserId`)
    REFERENCES `users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  CONSTRAINT `system_registration_config_singleton_check`
    CHECK (`id` = 1),

  CONSTRAINT `system_registration_config_prefix_check`
    CHECK (
      `usernamePrefixEnabled` = FALSE OR
      (
        `usernamePrefix` IS NOT NULL AND
        CHAR_LENGTH(TRIM(`usernamePrefix`)) BETWEEN 1 AND 20
      )
    )
)
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

CREATE TABLE `system_sequences` (
  `key` VARCHAR(100) NOT NULL,
  `nextValue` BIGINT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`key`),

  CONSTRAINT `system_sequences_next_value_check`
    CHECK (`nextValue` > 0)
)
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_auth_config`
  (`id`, `createdAt`, `updatedAt`)
VALUES
  (1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `system_registration_config`
  (`id`, `createdAt`, `updatedAt`)
VALUES
  (1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `system_sequences`
  (`key`, `nextValue`, `updatedAt`)
VALUES
  ('username', 100001, CURRENT_TIMESTAMP(3));
