-- FixTradeZone platform-time standard is UTC.
-- Only the mutable singleton operations setting is normalized here.
-- Historical package/internal-trading timezone snapshots remain immutable.
UPDATE system_operations_config
SET platformTimezone = 'UTC',
    updatedAt = UTC_TIMESTAMP(3)
WHERE id = 1
  AND platformTimezone <> 'UTC';
