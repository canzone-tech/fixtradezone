-- PROFILE-01 — saved USER withdrawal address and 30-day change lock.
-- Forward-only. Existing users remain incomplete until they explicitly save
-- their own USDT BNB Smart Chain (BEP-20) withdrawal address.

CREATE TABLE `user_withdrawal_profiles` (
  `userId` CHAR(36) NOT NULL,
  `asset` VARCHAR(10) NOT NULL DEFAULT 'USDT',
  `networkCode` VARCHAR(40) NOT NULL DEFAULT 'BEP20',
  `validationProfile` VARCHAR(20) NOT NULL DEFAULT 'EVM',
  `destinationAddress` VARCHAR(191) NOT NULL,
  `savedAt` DATETIME(3) NOT NULL,
  `lockedUntil` DATETIME(3) NOT NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`userId`),
  INDEX `user_withdrawal_profile_lock_idx` (`lockedUntil`),

  CONSTRAINT `user_withdrawal_profile_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT `user_withdrawal_profile_network_check`
    CHECK (
      `asset` = 'USDT'
      AND `networkCode` = 'BEP20'
      AND `validationProfile` = 'EVM'
    ),

  CONSTRAINT `user_withdrawal_profile_lock_check`
    CHECK (`lockedUntil` >= `savedAt`),

  CONSTRAINT `user_withdrawal_profile_revision_check`
    CHECK (`revision` > 0)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
