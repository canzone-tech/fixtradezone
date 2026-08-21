-- FixTradeZone user impersonation foundation.
-- Additive migration. No application database reset required.

ALTER TABLE `audit_logs`
MODIFY `action` ENUM(
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'APPROVE',
  'REJECT',
  'SUSPEND',
  'ACTIVATE',
  'BLOCK',
  'UNBLOCK',
  'PASSWORD_CHANGE',
  'ROLE_CHANGE',
  'PERMISSION_CHANGE',
  'IMPERSONATION_START',
  'IMPERSONATION_STOP'
) NOT NULL;

CREATE TABLE `impersonation_sessions` (
  `id` CHAR(36) NOT NULL,
  `actorUserId` CHAR(36) NOT NULL,
  `subjectUserId` CHAR(36) NOT NULL,
  `actorSessionId` CHAR(36) NOT NULL,
  `activeKey` CHAR(36) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `endedAt` DATETIME(3) NULL,
  `endReason` VARCHAR(100) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `impersonation_sessions_activeKey_key` (`activeKey`),
  INDEX `impersonation_sessions_actorUserId_endedAt_idx`
    (`actorUserId`, `endedAt`),
  INDEX `impersonation_sessions_subjectUserId_endedAt_idx`
    (`subjectUserId`, `endedAt`),
  INDEX `impersonation_sessions_actorSessionId_endedAt_idx`
    (`actorSessionId`, `endedAt`),
  INDEX `impersonation_sessions_expiresAt_idx`
    (`expiresAt`),

  CONSTRAINT `impersonation_sessions_actorUserId_fkey`
    FOREIGN KEY (`actorUserId`)
    REFERENCES `users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `impersonation_sessions_subjectUserId_fkey`
    FOREIGN KEY (`subjectUserId`)
    REFERENCES `users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `impersonation_sessions_actorSessionId_fkey`
    FOREIGN KEY (`actorSessionId`)
    REFERENCES `auth_sessions` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
)
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

INSERT INTO `permissions`
  (`id`, `code`, `description`, `createdAt`, `updatedAt`)
VALUES
  (
    UUID(),
    'users.impersonate',
    'Temporarily access an eligible user account for support',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  )
ON DUPLICATE KEY UPDATE
  `description` =
    'Temporarily access an eligible user account for support',
  `updatedAt` = CURRENT_TIMESTAMP(3);

-- ADMIN receives the permission initially because this feature is
-- explicitly available to both ADMIN and SUPER_ADMIN.
-- Founder can later remove it from ADMIN through the RBAC console.
INSERT IGNORE INTO `role_permissions`
  (`roleId`, `permissionId`)
SELECT
  r.`id`,
  p.`id`
FROM `roles` r
JOIN `permissions` p
  ON p.`code` = 'users.impersonate'
WHERE r.`name` = 'ADMIN';
