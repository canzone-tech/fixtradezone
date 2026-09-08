-- PKG-02 — exact package principal return accounting.
-- Forward-only. Existing migrations remain immutable.
-- Returnable package principal is moved from SYSTEM PACKAGE_PRINCIPAL back to
-- the USER MAIN wallet only after the package's internal-trading lifecycle is
-- completed. PrimeBot/non-refundable package value creates no return posting.

ALTER TABLE `ledger_transactions`
  MODIFY `kind` ENUM(
    'DEPOSIT_CREDIT',
    'PACKAGE_ACTIVATION_FUNDING',
    'REFERRAL_COMMISSION_CREDIT',
    'PACKAGE_REWARD_CREDIT',
    'INTERNAL_TRADING_SETTLEMENT',
    'PAYOUT_RESERVE',
    'PAYOUT_RELEASE',
    'PAYOUT_SETTLEMENT',
    'PACKAGE_PRINCIPAL_RETURN'
  ) NOT NULL;
