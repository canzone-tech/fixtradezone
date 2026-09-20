-- CANONICAL-TRADE-01 — Daily Trade is the canonical event for financial trading.
--
-- Forward-only rules:
-- - historical internal_trade_events remain immutable
-- - legacy rows keep simulatedActivityEventId = NULL and adjustment = 0
-- - new canonical rows link 1:1 to simulated_trade_activity_events
-- - raw Daily Trade identity/result remains unchanged in Internal Trading
-- - financialAdjustmentAmount records package target/cap interpretation only

ALTER TABLE `internal_trade_events`
  ADD COLUMN `simulatedActivityEventId` CHAR(36) NULL AFTER `sourceKey`,
  ADD COLUMN `financialAdjustmentAmount` DECIMAL(20,8) NOT NULL DEFAULT 0.00000000 AFTER `grossResultAmount`;

ALTER TABLE `internal_trade_events`
  ADD UNIQUE INDEX `internal_trade_sim_event_key` (`simulatedActivityEventId`),
  ADD CONSTRAINT `internal_trade_sim_event_fkey`
    FOREIGN KEY (`simulatedActivityEventId`)
    REFERENCES `simulated_trade_activity_events`(`id`)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT;

-- Raw trade fields always retain the canonical WIN/LOSS sign.  The separate
-- financialAdjustmentAmount may cap or reconcile the amount applied by the
-- package financial layer without rewriting the Daily Trade result.
ALTER TABLE `internal_trade_events`
  DROP CHECK `internal_trade_event_result_check`;

ALTER TABLE `internal_trade_events`
  ADD CONSTRAINT `internal_trade_event_result_check`
  CHECK (
    (
      `outcome` = 'WIN'
      AND `resultPercent` > 0
      AND `resultPercent` <= 100
      AND `grossResultAmount` > 0
    )
    OR
    (
      `outcome` = 'LOSS'
      AND `resultPercent` < 0
      AND `resultPercent` >= -100
      AND `grossResultAmount` < 0
    )
  );

ALTER TABLE `internal_trade_events`
  DROP CHECK `internal_trade_event_settlement_check`;

ALTER TABLE `internal_trade_events`
  ADD CONSTRAINT `internal_trade_event_settlement_check`
  CHECK (
    `grossSettlementAmount` >= 0
    AND `userShareAmount` >= 0
    AND `adminShareAmount` >= 0
    AND (`userShareAmount` + `adminShareAmount`) = `grossSettlementAmount`
    AND (
      (
        `settlementMode` IS NULL
        AND `financialAdjustmentAmount` = 0
        AND `grossSettlementAmount`
          = (`grossHighWaterAfter` - `grossHighWaterBefore`)
      )
      OR
      (
        `settlementMode` = 'HIGH_WATER'
        AND `financialAdjustmentAmount` = 0
        AND `grossSettlementAmount`
          = (`grossHighWaterAfter` - `grossHighWaterBefore`)
      )
      OR
      (
        `settlementMode` = 'WIN_IMMEDIATE'
        AND (
          (
            (`grossResultAmount` + `financialAdjustmentAmount`) <= 0
            AND `grossSettlementAmount` = 0
          )
          OR
          (
            (`grossResultAmount` + `financialAdjustmentAmount`) > 0
            AND `grossSettlementAmount`
              <= (`grossResultAmount` + `financialAdjustmentAmount`)
          )
        )
      )
    )
  );

-- MySQL does not permit a CHECK constraint to reference a column that also
-- participates in an FK referential action.  The canonical adjustment invariant
-- (legacy/unlinked rows must keep financialAdjustmentAmount = 0) is therefore
-- enforced by the canonical reconciliation write path, while the FK + UNIQUE
-- constraint above remains the database-level 1:1 integrity boundary.
