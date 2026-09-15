-- SUPPORT-01 — Support Ticketing System.
-- Forward-only. MySQL remains authoritative; email is notification transport only.
-- Ticket entries are append-only history. Attachments are intentionally out of scope.

ALTER TABLE `user_notifications`
  MODIFY `category` ENUM('GENERAL', 'SYSTEM', 'FINANCE', 'SECURITY', 'SUPPORT')
  NOT NULL DEFAULT 'GENERAL';

CREATE TABLE `support_ticket_categories` (
  `id` CHAR(36) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `sortOrder` INT NOT NULL DEFAULT 100,
  `createdByUserId` CHAR(36) NULL,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `support_ticket_categories_code_key` (`code`),
  INDEX `support_ticket_categories_active_sort_idx` (`isActive`, `sortOrder`, `name`),
  CONSTRAINT `support_ticket_categories_created_by_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `support_ticket_categories_updated_by_fkey`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_tickets` (
  `id` CHAR(36) NOT NULL,
  `ticketNumber` VARCHAR(32) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `categoryId` CHAR(36) NOT NULL,
  `categoryCode` VARCHAR(60) NOT NULL,
  `categoryName` VARCHAR(100) NOT NULL,
  `subject` VARCHAR(160) NOT NULL,
  `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  `assignedToUserId` CHAR(36) NULL,
  `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolvedAt` DATETIME(3) NULL,
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `support_tickets_ticket_number_key` (`ticketNumber`),
  INDEX `support_tickets_user_created_idx` (`userId`, `createdAt`),
  INDEX `support_tickets_status_activity_idx` (`status`, `lastActivityAt`),
  INDEX `support_tickets_assignee_status_idx` (`assignedToUserId`, `status`),
  INDEX `support_tickets_category_status_idx` (`categoryId`, `status`),
  CONSTRAINT `support_tickets_user_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `support_tickets_category_fkey`
    FOREIGN KEY (`categoryId`) REFERENCES `support_ticket_categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `support_tickets_assignee_fkey`
    FOREIGN KEY (`assignedToUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `support_ticket_entries` (
  `id` CHAR(36) NOT NULL,
  `ticketId` CHAR(36) NOT NULL,
  `type` ENUM('USER_REPLY', 'STAFF_REPLY', 'INTERNAL_NOTE', 'STATUS_CHANGE', 'ASSIGNMENT_CHANGE') NOT NULL,
  `authorUserId` CHAR(36) NULL,
  `body` VARCHAR(4000) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `support_ticket_entries_ticket_created_idx` (`ticketId`, `createdAt`, `id`),
  INDEX `support_ticket_entries_author_idx` (`authorUserId`, `createdAt`),
  CONSTRAINT `support_ticket_entries_ticket_fkey`
    FOREIGN KEY (`ticketId`) REFERENCES `support_tickets`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `support_ticket_entries_author_fkey`
    FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'support.tickets.read', 'View the support ticket queue and ticket details', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'support.tickets.reply', 'Reply to support tickets as staff', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'support.tickets.assign', 'Assign and unassign support tickets', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'support.tickets.status.manage', 'Change support ticket lifecycle status', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'support.tickets.notes.manage', 'Create staff-only internal support ticket notes', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'support.categories.manage', 'Create and manage support ticket categories', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `support_ticket_categories`
  (`id`, `code`, `name`, `description`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'GENERAL_SUPPORT', 'General Support', 'General account and platform assistance.', TRUE, 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'ACCOUNT_ACCESS', 'Account Access', 'Login, verification, profile, and account-access assistance.', TRUE, 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'DEPOSIT_PAYMENT', 'Deposit & Payment', 'Deposit submission and payment-status assistance.', TRUE, 30, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'PACKAGE_SUBSCRIPTION', 'Package & Subscription', 'Package activation and subscription assistance.', TRUE, 40, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'PAYOUT_WITHDRAWAL', 'Withdrawal & Payout', 'Withdrawal request and payout-status assistance.', TRUE, 50, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));