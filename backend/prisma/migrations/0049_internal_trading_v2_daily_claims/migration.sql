-- FTZ ITD-V2: forward-only opt-in daily NET-GROSS trading with manual claim.
-- Historical V1 events, package states, wallet and published policies untouched.
-- New states are tagged V2 and cannot be settled by the old V1 routines.
ALTER TABLE `internal_trade_subscription_states`
  ADD COLUMN `financialModelVersion` ENUM('V1', 'V2') NOT NULL DEFAULT 'V1'
    AFTER `subscriptionId`,
  MODIFY `completionReason` ENUM('TARGET_REACHED_AT_DURATION_END', 'DURATION_ELAPSED') NULL;

ALTER TABLE `internal_trade_subscription_states`
  DROP CHECK `internal_trade_state_target_check`,
  DROP CHECK `internal_trade_state_progress_check`,
  DROP CHECK `internal_trade_state_high_water_check`;

ALTER TABLE `internal_trade_subscription_states`
  ADD CONSTRAINT `internal_trade_state_target_check`
    CHECK (
      (`financialModelVersion` = 'V1' AND `grossTarget` > 0)
      OR (`financialModelVersion` = 'V2' AND `grossTarget` = 0)
    ),
  ADD CONSTRAINT `internal_trade_state_progress_check`
    CHECK (
      `financialModelVersion` = 'V2'
      OR `grossNetProgress` <= `grossTarget`
    ),
  ADD CONSTRAINT `internal_trade_state_high_water_check`
    CHECK (
      `grossHighWaterMark` >= 0
      AND (
        `financialModelVersion` = 'V2'
        OR `grossHighWaterMark` <= `grossTarget`
      )
    );

ALTER TABLE `internal_trade_events`
  ADD COLUMN `financialModelVersion` ENUM('V1', 'V2') NOT NULL DEFAULT 'V1'
    AFTER `subscriptionId`,
  MODIFY `settlementMode`
    ENUM('HIGH_WATER', 'WIN_IMMEDIATE', 'CLAIM_PENDING') NULL;

ALTER TABLE `internal_trade_events`
  DROP CHECK `internal_trade_event_target_check`,
  DROP CHECK `internal_trade_event_progress_check`,
  DROP CHECK `internal_trade_event_high_water_check`,
  DROP CHECK `internal_trade_event_settlement_check`;

ALTER TABLE `internal_trade_events`
  ADD CONSTRAINT `internal_trade_event_target_check`
    CHECK (
      (`financialModelVersion` = 'V1' AND `grossTarget` > 0)
      OR (`financialModelVersion` = 'V2' AND `grossTarget` = 0)
    ),
  ADD CONSTRAINT `internal_trade_event_progress_check`
    CHECK (
      `financialModelVersion` = 'V2'
      OR `grossProgressAfter` <= `grossTarget`
    ),
  ADD CONSTRAINT `internal_trade_event_high_water_check`
    CHECK (
      `grossHighWaterBefore` >= 0
      AND `grossHighWaterAfter` >= `grossHighWaterBefore`
      AND (
        `financialModelVersion` = 'V2'
        OR `grossHighWaterAfter` <= `grossTarget`
      )
    ),
  ADD CONSTRAINT `internal_trade_event_settlement_check`
    CHECK (
      `grossSettlementAmount` >= 0
      AND `userShareAmount` >= 0
      AND `adminShareAmount` >= 0
      AND (`userShareAmount` + `adminShareAmount`) = `grossSettlementAmount`
      AND (
        (`settlementMode` = 'CLAIM_PENDING'
          AND `financialModelVersion` = 'V2'
          AND `grossSettlementAmount` = 0
          AND `ledgerTransactionId` IS NULL)
        OR (`financialModelVersion` = 'V1'
          AND (
            ((`settlementMode` IS NULL OR `settlementMode` = 'HIGH_WATER')
              AND `financialAdjustmentAmount` = 0
              AND `grossSettlementAmount` = (`grossHighWaterAfter` - `grossHighWaterBefore`))
            OR
            (`settlementMode` = 'WIN_IMMEDIATE'
              AND (
                ((`grossResultAmount` + `financialAdjustmentAmount`) <= 0
                  AND `grossSettlementAmount` = 0)
                OR ((`grossResultAmount` + `financialAdjustmentAmount`) > 0
                  AND `grossSettlementAmount`
                    <= (`grossResultAmount` + `financialAdjustmentAmount`))
              ))
          ))
      )
    );

CREATE TABLE `internal_trade_daily_claims` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `subscriptionId` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `localTradeDate` DATE NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `dailyGrossRatePercent` DECIMAL(9,6) NOT NULL,
  `dailyNetGrossAmount` DECIMAL(20,8) NOT NULL,
  `userSharePercent` DECIMAL(9,6) NOT NULL,
  `adminSharePercent` DECIMAL(9,6) NOT NULL,
  `userAmount` DECIMAL(20,8) NOT NULL,
  `adminAmount` DECIMAL(20,8) NOT NULL,
  `tradeCount` INT NOT NULL,
  `status` ENUM('PENDING', 'CLAIMED') NOT NULL DEFAULT 'PENDING',
  `ledgerTransactionId` CHAR(36) NULL,
  `claimedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `itd_daily_claim_subscription_date` (`subscriptionId`, `localTradeDate`),
  UNIQUE INDEX `itd_daily_claim_ledger` (`ledgerTransactionId`),
  INDEX `itd_daily_claim_user_status_date` (`userId`, `status`, `localTradeDate`),
  CONSTRAINT `itd_daily_claim_subscription_fk` FOREIGN KEY (`subscriptionId`)
    REFERENCES `user_package_subscriptions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `itd_daily_claim_user_fk` FOREIGN KEY (`userId`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `itd_daily_claim_ledger_fk` FOREIGN KEY (`ledgerTransactionId`)
    REFERENCES `ledger_transactions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `itd_daily_claim_split_check` CHECK (
    `dailyNetGrossAmount` > 0
    AND `dailyGrossRatePercent` > 0
    AND `userAmount` >= 0
    AND `adminAmount` >= 0
    AND (`userAmount` + `adminAmount`) = `dailyNetGrossAmount`
    AND `userSharePercent` + `adminSharePercent` = 100
    AND `tradeCount` = 5
  ),
  CONSTRAINT `itd_daily_claim_status_check` CHECK (
    (`status` = 'PENDING' AND `ledgerTransactionId` IS NULL AND `claimedAt` IS NULL)
    OR (`status` = 'CLAIMED' AND `ledgerTransactionId` IS NOT NULL AND `claimedAt` IS NOT NULL)
  )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
