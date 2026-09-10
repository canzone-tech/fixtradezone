-- FixTradeZone LOCAL QA transactional reset — DRY RUN ONLY.
--
-- SAFETY CONTRACT
-- - READ-ONLY against persistent application tables.
-- - NO DELETE / UPDATE / TRUNCATE / DROP of persistent application data.
-- - Only a session-scoped TEMPORARY table is created/dropped.
-- - SUPER_ADMIN / ADMIN identities are excluded from reset candidates.
-- - This script discovers local QA USER data and dependency shape before any
--   destructive cleanup script is authored.
-- - Configuration/master data is reported as a baseline and must be preserved.
--
-- Run only against the local FixTradeZone MySQL database after migrations are
-- current. Review the COMPLETE output before authorizing any cleanup.

USE `fixtradezone`;

SET SESSION group_concat_max_len = 1000000;

SELECT
  'FIXTRADEZONE QA TRANSACTIONAL RESET — DRY RUN ONLY' AS gate,
  DATABASE() AS database_name,
  NOW(3) AS inspected_at;

-- ---------------------------------------------------------------------------
-- 1. Candidate USER identities
--
-- Candidates are accounts carrying USER role and carrying neither ADMIN nor
-- SUPER_ADMIN. Identity/login rows are NOT deleted by this dry run.
-- ---------------------------------------------------------------------------

DROP TEMPORARY TABLE IF EXISTS `qa_reset_candidates`;

CREATE TEMPORARY TABLE `qa_reset_candidates` (
  `id` CHAR(36) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MEMORY;

INSERT INTO `qa_reset_candidates` (`id`)
SELECT DISTINCT u.`id`
FROM `users` u
INNER JOIN `user_roles` ur ON ur.`userId` = u.`id`
INNER JOIN `roles` r ON r.`id` = ur.`roleId`
WHERE r.`name` = 'USER'
  AND NOT EXISTS (
    SELECT 1
    FROM `user_roles` ur_admin
    INNER JOIN `roles` r_admin ON r_admin.`id` = ur_admin.`roleId`
    WHERE ur_admin.`userId` = u.`id`
      AND r_admin.`name` IN ('ADMIN', 'SUPER_ADMIN')
  );

SELECT COUNT(*) AS qa_user_candidate_count
FROM `qa_reset_candidates`;

SELECT
  u.`id`,
  u.`username`,
  u.`email`,
  u.`phone`,
  u.`status`,
  GROUP_CONCAT(DISTINCT r.`name` ORDER BY r.`name` SEPARATOR ', ') AS roles,
  u.`createdAt`
FROM `qa_reset_candidates` q
INNER JOIN `users` u ON u.`id` = q.`id`
LEFT JOIN `user_roles` ur ON ur.`userId` = u.`id`
LEFT JOIN `roles` r ON r.`id` = ur.`roleId`
GROUP BY
  u.`id`, u.`username`, u.`email`, u.`phone`, u.`status`, u.`createdAt`
ORDER BY u.`createdAt`, u.`username`;

-- ---------------------------------------------------------------------------
-- 2. Every real FK that points directly at users(id), with candidate row count.
--
-- This exposes deposits, subscriptions, reward/trade/payout rows, actor fields,
-- referral rows, sessions, notification rows, ledger ownership, etc. according
-- to the ACTUAL local schema rather than a hand-maintained list.
-- ---------------------------------------------------------------------------

SELECT GROUP_CONCAT(
  CONCAT(
    'SELECT ''', REPLACE(k.`TABLE_NAME`, '''', ''''''), '.',
    REPLACE(k.`COLUMN_NAME`, '''', ''''''),
    ''' AS reference_path, COUNT(*) AS candidate_row_count FROM `',
    REPLACE(k.`TABLE_NAME`, '`', '``'), '` t INNER JOIN `qa_reset_candidates` q ON t.`',
    REPLACE(k.`COLUMN_NAME`, '`', '``'), '` = q.`id`'
  )
  ORDER BY k.`TABLE_NAME`, k.`COLUMN_NAME`
  SEPARATOR ' UNION ALL '
) INTO @qa_direct_user_fk_sql
FROM `information_schema`.`KEY_COLUMN_USAGE` k
WHERE k.`TABLE_SCHEMA` = DATABASE()
  AND k.`REFERENCED_TABLE_SCHEMA` = DATABASE()
  AND k.`REFERENCED_TABLE_NAME` = 'users'
  AND k.`REFERENCED_COLUMN_NAME` = 'id';

SET @qa_direct_user_fk_sql = COALESCE(
  @qa_direct_user_fk_sql,
  'SELECT ''NO_DIRECT_USER_FOREIGN_KEYS'' AS reference_path, 0 AS candidate_row_count'
);

PREPARE qa_direct_user_fk_stmt FROM @qa_direct_user_fk_sql;
EXECUTE qa_direct_user_fk_stmt;
DEALLOCATE PREPARE qa_direct_user_fk_stmt;

-- ---------------------------------------------------------------------------
-- 3. User-like columns that may not have an FK.
--
-- This is deliberately broader than section 2. It catches schema columns ending
-- in UserId even if a historical migration omitted a foreign-key constraint.
-- ---------------------------------------------------------------------------

SELECT GROUP_CONCAT(
  CONCAT(
    'SELECT ''', REPLACE(c.`TABLE_NAME`, '''', ''''''), '.',
    REPLACE(c.`COLUMN_NAME`, '''', ''''''),
    ''' AS user_like_path, COUNT(*) AS candidate_row_count FROM `',
    REPLACE(c.`TABLE_NAME`, '`', '``'), '` t INNER JOIN `qa_reset_candidates` q ON t.`',
    REPLACE(c.`COLUMN_NAME`, '`', '``'), '` = q.`id`'
  )
  ORDER BY c.`TABLE_NAME`, c.`COLUMN_NAME`
  SEPARATOR ' UNION ALL '
) INTO @qa_user_like_sql
FROM `information_schema`.`COLUMNS` c
WHERE c.`TABLE_SCHEMA` = DATABASE()
  AND LOWER(c.`COLUMN_NAME`) LIKE '%userid';

SET @qa_user_like_sql = COALESCE(
  @qa_user_like_sql,
  'SELECT ''NO_USER_LIKE_COLUMNS'' AS user_like_path, 0 AS candidate_row_count'
);

PREPARE qa_user_like_stmt FROM @qa_user_like_sql;
EXECUTE qa_user_like_stmt;
DEALLOCATE PREPARE qa_user_like_stmt;

-- ---------------------------------------------------------------------------
-- 4. Financial / lifecycle table inventory.
--
-- Whole-table counts are intentionally shown here. This reveals the complete
-- local transactional surface before the cleanup transaction is designed.
-- Some policy/config tables can appear in this inventory; they are NOT cleanup
-- targets merely because they match a keyword.
-- ---------------------------------------------------------------------------

SELECT GROUP_CONCAT(
  CONCAT(
    'SELECT ''', REPLACE(t.`TABLE_NAME`, '''', ''''''),
    ''' AS table_name, COUNT(*) AS total_rows FROM `',
    REPLACE(t.`TABLE_NAME`, '`', '``'), '`'
  )
  ORDER BY t.`TABLE_NAME`
  SEPARATOR ' UNION ALL '
) INTO @qa_transaction_inventory_sql
FROM `information_schema`.`TABLES` t
WHERE t.`TABLE_SCHEMA` = DATABASE()
  AND t.`TABLE_TYPE` = 'BASE TABLE'
  AND (
    LOWER(t.`TABLE_NAME`) LIKE '%deposit%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%subscription%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%ledger%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%wallet%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%commission%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%reward%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%trade%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%payout%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%withdraw%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%referral%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%simulated%'
    OR LOWER(t.`TABLE_NAME`) LIKE '%notification%'
  );

SET @qa_transaction_inventory_sql = COALESCE(
  @qa_transaction_inventory_sql,
  'SELECT ''NO_TRANSACTIONAL_TABLES_DISCOVERED'' AS table_name, 0 AS total_rows'
);

PREPARE qa_transaction_inventory_stmt FROM @qa_transaction_inventory_sql;
EXECUTE qa_transaction_inventory_stmt;
DEALLOCATE PREPARE qa_transaction_inventory_stmt;

-- ---------------------------------------------------------------------------
-- 5. FK dependency graph for financial / lifecycle tables.
--
-- The destructive cleanup, if approved after this dry run, must follow these
-- child -> parent dependencies instead of disabling foreign-key checks.
-- ---------------------------------------------------------------------------

SELECT
  k.`TABLE_NAME` AS child_table,
  k.`COLUMN_NAME` AS child_column,
  k.`REFERENCED_TABLE_NAME` AS parent_table,
  k.`REFERENCED_COLUMN_NAME` AS parent_column,
  k.`CONSTRAINT_NAME`
FROM `information_schema`.`KEY_COLUMN_USAGE` k
WHERE k.`TABLE_SCHEMA` = DATABASE()
  AND k.`REFERENCED_TABLE_SCHEMA` = DATABASE()
  AND k.`REFERENCED_TABLE_NAME` IS NOT NULL
  AND (
    LOWER(k.`TABLE_NAME`) LIKE '%deposit%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%subscription%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%ledger%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%wallet%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%commission%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%reward%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%trade%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%payout%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%withdraw%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%referral%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%simulated%'
    OR LOWER(k.`TABLE_NAME`) LIKE '%notification%'
  )
ORDER BY k.`TABLE_NAME`, k.`ORDINAL_POSITION`, k.`COLUMN_NAME`;

-- ---------------------------------------------------------------------------
-- 6. Configuration/master baseline counts that must remain unchanged.
--
-- These rows are explicitly a PRESERVE baseline. The later transactional reset
-- must reproduce these counts exactly unless a separate Founder-approved config
-- cleanup is intentionally performed.
-- ---------------------------------------------------------------------------

SELECT GROUP_CONCAT(
  CONCAT(
    'SELECT ''', REPLACE(t.`TABLE_NAME`, '''', ''''''),
    ''' AS preserve_table, COUNT(*) AS baseline_rows FROM `',
    REPLACE(t.`TABLE_NAME`, '`', '``'), '`'
  )
  ORDER BY t.`TABLE_NAME`
  SEPARATOR ' UNION ALL '
) INTO @qa_config_baseline_sql
FROM `information_schema`.`TABLES` t
WHERE t.`TABLE_SCHEMA` = DATABASE()
  AND t.`TABLE_TYPE` = 'BASE TABLE'
  AND (
    t.`TABLE_NAME` IN (
      '_prisma_migrations',
      'roles',
      'permissions',
      'role_permissions',
      'package_definitions',
      'package_plan_versions',
      'package_plan_items',
      'deposit_payment_rails',
      'deposit_accounts',
      'deposit_package_account_routes'
    )
    OR t.`TABLE_NAME` LIKE 'system\_%'
    OR t.`TABLE_NAME` LIKE 'referral_commission_plan\_%'
    OR t.`TABLE_NAME` LIKE 'referral_commission_level\_%'
    OR t.`TABLE_NAME` LIKE 'referral_commission_package\_%'
    OR t.`TABLE_NAME` LIKE 'reward_cap_policy\_%'
    OR t.`TABLE_NAME` LIKE 'simulated_activity_policy\_%'
    OR t.`TABLE_NAME` LIKE 'internal_trade_policy\_%'
    OR t.`TABLE_NAME` LIKE 'payout_policy\_%'
    OR t.`TABLE_NAME` LIKE 'award_reward_policy\_%'
    OR t.`TABLE_NAME` LIKE '%template%'
  );

SET @qa_config_baseline_sql = COALESCE(
  @qa_config_baseline_sql,
  'SELECT ''NO_PRESERVE_TABLES_DISCOVERED'' AS preserve_table, 0 AS baseline_rows'
);

PREPARE qa_config_baseline_stmt FROM @qa_config_baseline_sql;
EXECUTE qa_config_baseline_stmt;
DEALLOCATE PREPARE qa_config_baseline_stmt;

-- ---------------------------------------------------------------------------
-- 7. Receiving-account deletion safety report.
--
-- This identifies old test configuration such as Legacy / unassigned accounts.
-- A hard delete is eligible only when BOTH counts are zero. Actual deletion is
-- intentionally NOT performed by this script.
-- ---------------------------------------------------------------------------

SELECT
  da.`id`,
  da.`label`,
  da.`asset`,
  da.`network`,
  da.`walletAddress`,
  da.`isActive`,
  da.`revision`,
  COUNT(DISTINCT d.`id`) AS deposit_reference_count,
  COUNT(DISTINCT r.`packageDefinitionId`) AS package_route_reference_count,
  CASE
    WHEN COUNT(DISTINCT d.`id`) = 0
      AND COUNT(DISTINCT r.`packageDefinitionId`) = 0
    THEN 'HARD_DELETE_ELIGIBLE_AFTER_EXPLICIT_APPROVAL'
    ELSE 'PRESERVE_OR_DETACH_SAFELY'
  END AS cleanup_safety
FROM `deposit_accounts` da
LEFT JOIN `deposits` d
  ON d.`assignedDepositAccountId` = da.`id`
LEFT JOIN `deposit_package_account_routes` r
  ON r.`depositAccountId` = da.`id`
GROUP BY
  da.`id`, da.`label`, da.`asset`, da.`network`, da.`walletAddress`,
  da.`isActive`, da.`revision`, da.`createdAt`
ORDER BY da.`createdAt`, da.`id`;

-- ---------------------------------------------------------------------------
-- 8. Final safety marker.
-- ---------------------------------------------------------------------------

SELECT
  'DRY RUN COMPLETE — ZERO PERSISTENT ROWS MODIFIED' AS result,
  COUNT(*) AS candidate_users_reviewed
FROM `qa_reset_candidates`;

DROP TEMPORARY TABLE IF EXISTS `qa_reset_candidates`;
