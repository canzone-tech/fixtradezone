-- ITD-02B — target reconciliation event foundation.
--
-- 0018 remains immutable.
--
-- Normal events obey configured WIN/LOSS ranges.
-- TARGET_RECONCILIATION exists only as the duration-end safety
-- mechanism required to close package gross progress exactly
-- at grossTarget without rewriting historical events.

ALTER TABLE `internal_trade_events`
  ADD COLUMN `eventType`
    ENUM('NORMAL', 'TARGET_RECONCILIATION')
    NOT NULL DEFAULT 'NORMAL'
    AFTER `outcome`;

-- Allow reconciliation percentage to represent a larger
-- duration-end correction if required.
ALTER TABLE `internal_trade_events`
  MODIFY `resultPercent`
    DECIMAL(18,6) NOT NULL;

ALTER TABLE `internal_trade_events`
  DROP CHECK `internal_trade_event_result_check`;

ALTER TABLE `internal_trade_events`
  ADD CONSTRAINT `internal_trade_event_result_check`
  CHECK (
    (
      `eventType` = 'NORMAL'
      AND (
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
      )
    )
    OR
    (
      `eventType` = 'TARGET_RECONCILIATION'
      AND `outcome` = 'WIN'
      AND `resultPercent` > 0
      AND `grossResultAmount` > 0
    )
  );
