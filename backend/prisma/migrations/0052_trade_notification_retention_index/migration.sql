-- Optimizes bounded 5-day retention scans of ephemeral WIN/LOSS / claim alerts.
-- No financial tables or existing data are modified.
CREATE INDEX `user_notifications_source_created_idx`
  ON `user_notifications` (`sourceType`, `createdAt`, `id`);
