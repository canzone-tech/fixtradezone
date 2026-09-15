-- SUPPORT-01 — optional secure ticket attachments.
-- Forward-only. Migration 0042 remains immutable.
-- Files are stored outside MySQL; MySQL stores authoritative attachment metadata.

CREATE TABLE `support_ticket_attachments` (
  `id` CHAR(36) NOT NULL,
  `ticketId` CHAR(36) NOT NULL,
  `uploadedByUserId` CHAR(36) NOT NULL,
  `originalName` VARCHAR(255) NOT NULL,
  `storageKey` VARCHAR(500) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `sizeBytes` BIGINT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `support_ticket_attachments_storage_key_key` (`storageKey`),
  KEY `support_ticket_attachments_ticket_created_idx` (`ticketId`, `createdAt`),
  KEY `support_ticket_attachments_uploader_idx` (`uploadedByUserId`),

  CONSTRAINT `support_ticket_attachments_ticket_fkey`
    FOREIGN KEY (`ticketId`) REFERENCES `support_tickets` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `support_ticket_attachments_uploader_fkey`
    FOREIGN KEY (`uploadedByUserId`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
