-- CMS-02 — explicit current-publication pointers for immutable published revisions.
-- Forward-only. MySQL remains the sole application database.
-- Revisions retain their original payload/status; rollback only repoints the live publication.

ALTER TABLE `content_revisions`
  ADD UNIQUE KEY `content_revisions_id_contentKey_key` (`id`, `contentKey`);

CREATE TABLE `content_publications` (
  `contentKey` VARCHAR(100) NOT NULL,
  `revisionId` CHAR(36) NOT NULL,
  `publishedByUserId` CHAR(36) NULL,
  `publishedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`contentKey`),
  UNIQUE KEY `content_publications_revisionId_key` (`revisionId`),
  KEY `content_publications_publishedByUserId_idx` (`publishedByUserId`),
  CONSTRAINT `content_publications_revision_content_fkey`
    FOREIGN KEY (`revisionId`, `contentKey`) REFERENCES `content_revisions` (`id`, `contentKey`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `content_publications_publishedByUserId_fkey`
    FOREIGN KEY (`publishedByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `content_publications`
  (`contentKey`, `revisionId`, `publishedByUserId`, `publishedAt`, `createdAt`, `updatedAt`)
SELECT
  cr.`contentKey`,
  cr.`id`,
  cr.`publishedByUserId`,
  COALESCE(cr.`publishedAt`, cr.`updatedAt`),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `content_revisions` cr
INNER JOIN (
  SELECT `contentKey`, MAX(`version`) AS `version`
  FROM `content_revisions`
  WHERE `status` = 'PUBLISHED'
  GROUP BY `contentKey`
) latest
  ON latest.`contentKey` = cr.`contentKey`
 AND latest.`version` = cr.`version`;
