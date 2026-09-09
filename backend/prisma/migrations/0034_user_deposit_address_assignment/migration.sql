-- DEP-02: persist one receiving-account assignment per USER/payment rail.
-- Existing deposits remain immutable. Where possible, reuse the user's latest
-- currently-active historical receiving account for that rail.

CREATE TABLE `user_deposit_address_assignments` (
  `id` CHAR(36) NOT NULL,
  `userId` CHAR(36) NOT NULL,
  `paymentRailId` CHAR(36) NOT NULL,
  `depositAccountId` CHAR(36) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uda_user_rail_uq` (`userId`, `paymentRailId`),
  KEY `uda_rail_idx` (`paymentRailId`),
  KEY `uda_account_idx` (`depositAccountId`),
  CONSTRAINT `uda_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `uda_rail_fk`
    FOREIGN KEY (`paymentRailId`) REFERENCES `deposit_payment_rails` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `uda_account_fk`
    FOREIGN KEY (`depositAccountId`) REFERENCES `deposit_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve continuity for users who already deposited on an active rail/account.
-- The latest currently-active historical account becomes the permanent assignment.
INSERT INTO `user_deposit_address_assignments` (
  `id`,
  `userId`,
  `paymentRailId`,
  `depositAccountId`,
  `assignedAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  UUID(),
  d.`userId`,
  da.`paymentRailId`,
  d.`assignedDepositAccountId`,
  d.`createdAt`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `deposits` d
INNER JOIN `deposit_accounts` da
  ON da.`id` = d.`assignedDepositAccountId`
 AND da.`isActive` = TRUE
INNER JOIN `deposit_payment_rails` dpr
  ON dpr.`id` = da.`paymentRailId`
 AND dpr.`isActive` = TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM `deposits` d2
  INNER JOIN `deposit_accounts` da2
    ON da2.`id` = d2.`assignedDepositAccountId`
   AND da2.`isActive` = TRUE
  WHERE d2.`userId` = d.`userId`
    AND da2.`paymentRailId` = da.`paymentRailId`
    AND (
      d2.`createdAt` > d.`createdAt`
      OR (d2.`createdAt` = d.`createdAt` AND d2.`id` > d.`id`)
    )
);
