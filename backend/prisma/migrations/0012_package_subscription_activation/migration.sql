-- SUB-01 — package subscription / activation foundation.
-- Applied migrations 0010/0011 remain immutable; this is forward-only.

ALTER TABLE `ledger_accounts`
  MODIFY `bucket` ENUM(
    'MAIN',
    'PACKAGE_EARNINGS',
    'REFERRAL_COMMISSION',
    'REWARDS',
    'DEPOSIT_CLEARING',
    'PACKAGE_PRINCIPAL'
  ) NOT NULL;

ALTER TABLE `ledger_transactions`
  MODIFY `kind` ENUM(
    'DEPOSIT_CREDIT',
    'PACKAGE_ACTIVATION_FUNDING'
  ) NOT NULL;

CREATE TABLE `user_package_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `sourceDepositId` CHAR(36) NOT NULL,
  `sourceDepositAccountingTransactionId` CHAR(36) NOT NULL,
  `fundingLedgerTransactionId` CHAR(36) NOT NULL,
  `packagePlanVersionId` CHAR(36) NOT NULL,
  `packagePlanItemId` CHAR(36) NOT NULL,
  `packageDefinitionId` CHAR(36) NOT NULL,
  `packageCode` VARCHAR(64) NOT NULL,
  `packageDisplayName` VARCHAR(100) NOT NULL,
  `price` DECIMAL(20,8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `activePackageMode` VARCHAR(40) NOT NULL,
  `multipleActivePackageBasis` VARCHAR(60) NOT NULL,
  `activationTrigger` VARCHAR(40) NOT NULL,
  `renewalMode` VARCHAR(50) NOT NULL,
  `upgradesEnabled` BOOLEAN NOT NULL,
  `settlementTimezone` VARCHAR(64) NOT NULL,
  `rewardRateMode` VARCHAR(40) NOT NULL,
  `fixedRewardRate` DECIMAL(9,6) NULL,
  `minimumRewardRate` DECIMAL(9,6) NULL,
  `maximumRewardRate` DECIMAL(9,6) NULL,
  `rewardRateMeaning` VARCHAR(40) NOT NULL,
  `capBasis` VARCHAR(40) NOT NULL,
  `capMultiplier` DECIMAL(10,4) NOT NULL,
  `principalTreatment` VARCHAR(50) NOT NULL,
  `goalDays` INT NOT NULL,
  `cycleDays` INT NOT NULL,
  `rewardStartMode` VARCHAR(50) NOT NULL,
  `rewardFrequency` VARCHAR(50) NOT NULL,
  `cycleDayMode` VARCHAR(50) NOT NULL,
  `rewardDayMode` VARCHAR(50) NOT NULL,
  `cycleEndAction` VARCHAR(50) NOT NULL,
  `capReachedAction` VARCHAR(50) NOT NULL,
  `status` ENUM('ACTIVE', 'COMPLETED', 'SUPERSEDED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `activatedAt` DATETIME(3) NOT NULL,
  `scheduledEndAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_package_subscriptions_sourceDepositId_key` (`sourceDepositId`),
  UNIQUE INDEX `user_package_subscriptions_fundingLedgerTransactionId_key` (`fundingLedgerTransactionId`),
  INDEX `user_package_subscriptions_user_status_idx` (`userId`, `status`, `activatedAt`),
  INDEX `user_package_subscriptions_package_item_idx` (`packagePlanItemId`),
  INDEX `user_package_subscriptions_source_accounting_idx` (`sourceDepositAccountingTransactionId`),

  CONSTRAINT `user_package_subscriptions_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_package_subscriptions_sourceDepositId_fkey`
    FOREIGN KEY (`sourceDepositId`) REFERENCES `deposits`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ups_source_accounting_tx_fkey`
    FOREIGN KEY (`sourceDepositAccountingTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_package_subscriptions_fundingLedgerTransactionId_fkey`
    FOREIGN KEY (`fundingLedgerTransactionId`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_package_subscriptions_planVersionId_fkey`
    FOREIGN KEY (`packagePlanVersionId`) REFERENCES `package_plan_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_package_subscriptions_planItemId_fkey`
    FOREIGN KEY (`packagePlanItemId`) REFERENCES `package_plan_items`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_package_subscriptions_packageDefinitionId_fkey`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_package_subscriptions_price_check` CHECK (`price` > 0),
  CONSTRAINT `user_package_subscriptions_goal_days_check` CHECK (`goalDays` > 0),
  CONSTRAINT `user_package_subscriptions_cycle_days_check` CHECK (`cycleDays` > 0),
  CONSTRAINT `user_package_subscriptions_cycle_goal_check` CHECK (`cycleDays` <= `goalDays`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `code`, `description`, `createdAt`, `updatedAt`) VALUES
  (UUID(), 'subscriptions.read', 'View USER package subscriptions and activation history', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'subscriptions.activate', 'Reconcile eligible approved/accounted deposits into package activations', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
