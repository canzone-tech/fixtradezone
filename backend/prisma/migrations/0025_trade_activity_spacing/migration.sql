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

-- The original seeded 09:00-21:00 window cannot fit five trades with four-hour
-- minimum gaps. Only untouched DRAFTs with that exact seed window are widened;
-- custom draft windows and every PUBLISHED historical policy remain unchanged.
UPDATE `simulated_activity_policy_versions`
SET `timingWindows` = JSON_ARRAY(JSON_OBJECT('start', '00:00', 'end', '23:59'))
WHERE `status` = 'DRAFT'
  AND `minimumGapMinutes` = 240
  AND JSON_LENGTH(`timingWindows`) = 1
  AND JSON_UNQUOTE(JSON_EXTRACT(`timingWindows`, '$[0].start')) = '09:00'
  AND JSON_UNQUOTE(JSON_EXTRACT(`timingWindows`, '$[0].end')) = '21:00';
