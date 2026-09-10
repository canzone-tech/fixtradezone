-- DEP-03 approval policy: SUPER_ADMIN chooses explicit MANUAL approval or
-- automatic approval after successful blockchain verification per payment rail.
-- Existing rails default to MANUAL so this migration cannot silently enable
-- financial automation.

CREATE TABLE `deposit_payment_rail_approval_configs` (
  `paymentRailId` CHAR(36) NOT NULL,
  `approvalMode` ENUM('MANUAL', 'AUTO_AFTER_BLOCKCHAIN_VERIFIED') NOT NULL DEFAULT 'MANUAL',
  `revision` INT NOT NULL DEFAULT 1,
  `updatedByUserId` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`paymentRailId`),
  KEY `dprac_updated_by_idx` (`updatedByUserId`),
  CONSTRAINT `dprac_rail_fk`
    FOREIGN KEY (`paymentRailId`) REFERENCES `deposit_payment_rails` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `dprac_updated_by_fk`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
