-- AUDIT-01 — read-only administration audit-log workspace.
-- Forward-only. The existing immutable audit_logs table remains unchanged.
-- This migration only introduces the RBAC permission required by the new read API/UI.

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'audit_logs.read', 'View immutable administration audit logs', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
