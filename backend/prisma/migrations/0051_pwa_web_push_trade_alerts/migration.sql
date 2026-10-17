-- Forward-only PWA Web Push transport for persisted Internal Trading WIN/LOSS notifications.
-- No modifications to trading, claims, ledger or existing notification rows.

CREATE TABLE `user_web_push_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `endpointHash` CHAR(64) NOT NULL,
  `endpoint` VARCHAR(2048) NOT NULL,
  `p256dh` VARCHAR(256) NOT NULL,
  `auth` VARCHAR(256) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_web_push_endpoint_hash_uq` (`endpointHash`),
  INDEX `user_web_push_user_active_idx` (`userId`, `active`),
  CONSTRAINT `user_web_push_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_notification_push_deliveries` (
  `id` CHAR(36) NOT NULL,
  `notificationId` CHAR(36) NOT NULL,
  `subscriptionId` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'SENDING', 'RETRY', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `claimToken` CHAR(36) NULL,
  `lockedUntil` DATETIME(3) NULL,
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastError` VARCHAR(500) NULL,
  `sentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_notification_push_pair_uq` (`notificationId`, `subscriptionId`),
  INDEX `user_notification_push_due_idx` (`status`, `nextAttemptAt`, `lockedUntil`),
  CONSTRAINT `user_notification_push_notification_fk` FOREIGN KEY (`notificationId`) REFERENCES `user_notifications` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `user_notification_push_subscription_fk` FOREIGN KEY (`subscriptionId`) REFERENCES `user_web_push_subscriptions` (`id`) ON DELETE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
