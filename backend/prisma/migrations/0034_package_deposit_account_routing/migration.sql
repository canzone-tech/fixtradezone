-- DEP-02: one stable receiving-account route per package definition.
-- No per-user address assignment exists in this design. Historical deposits
-- retain their snapshotted account/address/network and are never rewritten.

CREATE TABLE `deposit_package_account_routes` (
  `packageDefinitionId` CHAR(36) NOT NULL,
  `depositAccountId` CHAR(36) NOT NULL,
  `updatedByUserId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`packageDefinitionId`),
  KEY `dpar_account_idx` (`depositAccountId`),
  KEY `dpar_updated_by_idx` (`updatedByUserId`),
  CONSTRAINT `dpar_package_fk`
    FOREIGN KEY (`packageDefinitionId`) REFERENCES `package_definitions` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `dpar_account_fk`
    FOREIGN KEY (`depositAccountId`) REFERENCES `deposit_accounts` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `dpar_updated_by_fk`
    FOREIGN KEY (`updatedByUserId`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
