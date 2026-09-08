-- NOTIFY-01 + RPT-01 — V1 closeout modules.
-- Forward-only. No existing migration is rewritten.
-- Notifications add non-financial user-facing delivery/read state.
-- Reports are read-only and require no report materialization tables.

CREATE TABLE `user_notifications` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `category` ENUM('GENERAL', 'SYSTEM', 'FINANCE', 'SECURITY') NOT NULL DEFAULT 'GENERAL',
  `title` VARCHAR(160) NOT NULL,
  `message` VARCHAR(2000) NOT NULL,
  `sourceType` VARCHAR(60) NULL,
  `sourceId` VARCHAR(100) NULL,
  `createdByUserId` CHAR(36) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `user_notifications_user_read_created_idx` (`userId`, `readAt`, `createdAt`),
  INDEX `user_notifications_created_idx` (`createdAt`),
  INDEX `user_notifications_creator_idx` (`createdByUserId`),
  INDEX `user_notifications_source_idx` (`sourceType`, `sourceId`),

  CONSTRAINT `user_notifications_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_notifications_creator_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'notifications.read', 'View administration notification delivery and read state', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'notifications.manage', 'Create targeted or broadcast in-app user notifications', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'reports.read', 'View read-only administration operational and financial reports', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
