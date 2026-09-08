-- ITD business-rule transition:
-- - historical events remain untouched
-- - new WIN events settle immediately
-- - LOSS never reverses prior wallet settlement
-- - cumulative gross financial settlement remains capped by package gross target

ALTER TABLE `internal_trade_events`
  ADD COLUMN `settlementMode`
    ENUM('HIGH_WATER', 'WIN_IMMEDIATE')
    NULL
    AFTER `grossHighWaterAfter`;

-- Existing rows intentionally remain NULL.
-- NULL means legacy HIGH_WATER semantics and preserves historical immutability.

ALTER TABLE `internal_trade_events`
  DROP CHECK `internal_trade_event_settlement_check`;

ALTER TABLE `internal_trade_events`
  ADD CONSTRAINT `internal_trade_event_settlement_check`
  CHECK (
    `grossSettlementAmount` >= 0
    AND `userShareAmount` >= 0
    AND `adminShareAmount` >= 0
    AND (`userShareAmount` + `adminShareAmount`)
      = `grossSettlementAmount`
    AND (
      (
        `settlementMode` IS NULL
        AND `grossSettlementAmount`
          = (`grossHighWaterAfter` - `grossHighWaterBefore`)
      )
      OR
      (
        `settlementMode` = 'HIGH_WATER'
        AND `grossSettlementAmount`
          = (`grossHighWaterAfter` - `grossHighWaterBefore`)
      )
      OR
      (
        `settlementMode` = 'WIN_IMMEDIATE'
        AND (
          (
            `grossResultAmount` <= 0
            AND `grossSettlementAmount` = 0
          )
          OR
          (
            `grossResultAmount` > 0
            AND `grossSettlementAmount` <= `grossResultAmount`
          )
        )
      )
    )
  );
