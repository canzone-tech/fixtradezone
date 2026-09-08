-- CMS-01 — versioned public landing and email-template content revisions.
-- Forward-only. MySQL remains the sole relational/business source of truth.
-- Published revisions are immutable by application contract; edits create new draft versions.

CREATE TABLE `content_revisions` (
  `id` CHAR(36) NOT NULL,
  `contentKey` VARCHAR(100) NOT NULL,
  `version` INT UNSIGNED NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `templateKey` VARCHAR(100) NOT NULL,
  `payload` JSON NOT NULL,
  `createdByUserId` CHAR(36) NULL,
  `publishedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `publishedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `content_revisions_contentKey_version_key` (`contentKey`, `version`),
  KEY `content_revisions_contentKey_status_version_idx` (`contentKey`, `status`, `version`),
  KEY `content_revisions_createdByUserId_idx` (`createdByUserId`),
  KEY `content_revisions_publishedByUserId_idx` (`publishedByUserId`),
  CONSTRAINT `content_revisions_createdByUserId_fkey`
    FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `content_revisions_publishedByUserId_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'content.read', 'View administration content and template revisions', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'content.manage', 'Create versioned landing and email-template drafts', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'content.publish', 'Publish approved landing and email-template revisions', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- SUPER_ADMIN permissions are implicit in the authentication boundary. ADMIN receives
-- the new V1 content permissions explicitly so the CMS can be operated without founder-only access.
INSERT IGNORE INTO `role_permissions` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`code` IN ('content.read', 'content.manage', 'content.publish')
WHERE r.`name` = 'ADMIN';
