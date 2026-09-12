-- PACKAGE-RESTORE-01 — restore the original deposit/TXID package-purchase lineage.
-- Forward-only. Applied migration 0040 remains immutable.
--
-- Locked business rule:
-- - Payout spends authoritative Total Wallet.
-- - Package purchase remains deposit/TXID funded exactly as before TOTAL-WALLET-02.
--
-- Safety:
-- A pre-acceptance direct Total-Wallet package subscription created by 0040 would
-- have NULL sourceDepositId/sourceDepositAccountingTransactionId. Restoring the
-- NOT NULL constraints below therefore fails closed instead of deleting or
-- rewriting financial history. Any such row must be investigated explicitly.

ALTER TABLE `referral_commission_runs`
  MODIFY `sourceDepositId` CHAR(36) NOT NULL;

ALTER TABLE `user_package_subscriptions`
  MODIFY `sourceDepositId` CHAR(36) NOT NULL,
  MODIFY `sourceDepositAccountingTransactionId` CHAR(36) NOT NULL;

DROP INDEX `ups_user_purchase_request_key`
  ON `user_package_subscriptions`;

ALTER TABLE `user_package_subscriptions`
  DROP COLUMN `purchaseRequestKey`,
  DROP COLUMN `fundingSource`;
