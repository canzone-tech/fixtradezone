-- Trading V2 is published through the existing SUPER_ADMIN Internal Trading
-- Policy Draft -> Publish lifecycle. Published V1 policies keep V1 by default;
-- no existing subscription state or ledger record is rewritten.
ALTER TABLE `internal_trade_policy_versions`
  ADD COLUMN `financialModelVersion` ENUM('V1', 'V2') NOT NULL DEFAULT 'V1'
    AFTER `enabled`;

-- V2 uses precisely five canonical Daily Trade slots. V1 retains its
-- existing published per-day minimum and historical values.
ALTER TABLE `internal_trade_policy_versions`
  ADD CONSTRAINT `internal_trade_policy_v2_five_slots_check`
    CHECK (
      `financialModelVersion` = 'V1'
      OR `activitiesPerDay` = 5
    );
