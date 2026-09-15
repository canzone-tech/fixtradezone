-- TOTAL-WALLET-PACKAGE-01 — direct USER package purchase from authoritative Total Wallet.
-- Forward-only. Existing deposit-funded subscriptions and immutable history remain unchanged.
--
-- New direct purchases do not create synthetic deposits. Deposit lineage is therefore nullable
-- for new Total-Wallet-funded subscriptions, while historical rows keep their original values.

ALTER TABLE `user_package_subscriptions`
  MODIFY `sourceDepositId` CHAR(36) NULL,
  MODIFY `sourceDepositAccountingTransactionId` CHAR(36) NULL,
  ADD COLUMN `fundingSource` ENUM('DEPOSIT', 'TOTAL_WALLET') NOT NULL DEFAULT 'DEPOSIT'
    AFTER `sourceDepositAccountingTransactionId`,
  ADD COLUMN `purchaseRequestKey` CHAR(36) NULL
    AFTER `fundingSource`,
  ADD UNIQUE INDEX `ups_user_purchase_request_key` (`userId`, `purchaseRequestKey`);

-- Referral commission runs are subscription-driven. A direct Total Wallet purchase has no
-- source deposit, so commission history preserves a NULL deposit lineage for that case.
ALTER TABLE `referral_commission_runs`
  MODIFY `sourceDepositId` CHAR(36) NULL;
