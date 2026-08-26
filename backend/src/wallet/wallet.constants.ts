export const USER_WALLET_BUCKETS = [
  'MAIN',
  'PACKAGE_EARNINGS',
  'REFERRAL_COMMISSION',
  'REWARDS',
] as const;

export type UserWalletBucket = (typeof USER_WALLET_BUCKETS)[number];

export const LEDGER_SIDES = ['DEBIT', 'CREDIT'] as const;
export type LedgerSide = (typeof LEDGER_SIDES)[number];

export const LEDGER_KINDS = ['DEPOSIT_CREDIT'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const WALLET_AUDIT_OPERATIONS = {
  POST_DEPOSIT: 'POST_APPROVED_DEPOSIT_ACCOUNTING',
  RECONCILE_DEPOSIT: 'RECONCILE_APPROVED_DEPOSIT_ACCOUNTING',
} as const;

export function userWalletAccountKey(
  userId: string,
  bucket: UserWalletBucket,
  currency: string,
): string {
  return `USER:${userId}:${bucket}:${currency}`;
}

export function depositClearingAccountKey(currency: string): string {
  return `SYSTEM:DEPOSIT_CLEARING:${currency}`;
}

export function depositCreditSourceKey(depositId: string): string {
  return `DEPOSIT:${depositId}:CREDIT`;
}
