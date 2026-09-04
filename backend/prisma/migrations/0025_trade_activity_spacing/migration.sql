-- TRADE-01 — client-facing Trade Activity spacing policy.
-- Forward-only. Historical policy rows remain unchanged with NULL spacing.
-- Internal simulated_* table/API naming is retained intentionally; this migration
-- changes scheduling policy only and creates no wallet/ledger mutations.

ALTER TABLE `simulated_activity_policy_versions`
  ADD COLUMN `minimumGapMinutes` INT NULL AFTER `activitiesPerDay`;

ALTER TABLE `simulated_activity_policy_versions`
  ADD CONSTRAINT `sim_activity_policy_min_gap_check`
  CHECK (
    `minimumGapMinutes` IS NULL
    OR `minimumGapMinutes` BETWEEN 0 AND 1439
  );
