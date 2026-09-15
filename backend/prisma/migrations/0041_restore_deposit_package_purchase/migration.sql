-- PAYOUT-REINVEST-01 — compatibility boundary for Payout vs Reinvestment.
-- Forward-only. Applied migration 0040 remains immutable.
--
-- Final business rule:
-- - The existing Packages -> Deposit / TXID purchase flow remains unchanged.
-- - Payouts spend authoritative Total Wallet.
-- - Payouts also expose an explicit Reinvestment action that can fund a package
--   directly from Total Wallet after the USER selects an amount-eligible package.
--
-- Reinvestment has no external deposit row, so deposit lineage on its immutable
-- subscription/commission snapshots must remain nullable. This statement also
-- repairs the partial first statement from the earlier failed local 0041 attempt.

ALTER TABLE `referral_commission_runs`
  MODIFY `sourceDepositId` CHAR(36) NULL;

-- Intentionally keep the 0040 columns on user_package_subscriptions:
--   sourceDepositId/sourceDepositAccountingTransactionId nullable,
--   fundingSource, purchaseRequestKey.
-- Deposit-backed package activations continue writing their normal immutable
-- deposit lineage; reinvestment writes fundingSource=TOTAL_WALLET and no deposit.
