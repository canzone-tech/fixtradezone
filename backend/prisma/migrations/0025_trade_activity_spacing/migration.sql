-- TRADE-01 — client-facing Trade Activity spacing policy.
-- Forward-only. Historical PUBLISHED policy rows remain unchanged with NULL spacing
-- so already-effective schedules preserve their exact legacy behavior.
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

-- Drafts are editable and have never produced immutable events. Give existing
-- drafts the new recommended default while preserving every published version.
UPDATE `simulated_activity_policy_versions`
SET `minimumGapMinutes` = 240
WHERE `status` = 'DRAFT'
  AND `minimumGapMinutes` IS NULL;
