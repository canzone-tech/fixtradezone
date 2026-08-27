export const USER_WALLET_BUCKETS = [
  'MAIN',
  'PACKAGE_EARNINGS',
  'REFERRAL_COMMISSION',
  'REWARDS',
] as const;

export type UserWalletBucket = (typeof USER_WALLET_BUCKETS)[number];

export const LEDGER_SIDES = ['DEBIT', 'CREDIT'] as const;
export type LedgerSide = (typeof LEDGER_SIDES)[number];

export const LEDGER_KINDS = [
  'DEPOSIT_CREDIT',
  'PACKAGE_ACTIVATION_FUNDING',
  'REFERRAL_COMMISSION_CREDIT',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const WALLET_AUDIT_OPERATIONS = {
  POST_DEPOSIT: 'POST_APPROVED_DEPOSIT_ACCOUNTING',
  RECONCILE_DEPOSIT: 'RECONCILE_APPROVED_DEPOSIT_ACCOUNTING',
  FUND_PACKAGE_ACTIVATION: 'FUND_PACKAGE_ACTIVATION',
  POST_REFERRAL_COMMISSION: 'POST_REFERRAL_COMMISSION',
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

export function packagePrincipalAccountKey(currency: string): string {
  return `SYSTEM:PACKAGE_PRINCIPAL:${currency}`;
}

export function referralCommissionExpenseAccountKey(currency: string): string {
  return `SYSTEM:REFERRAL_COMMISSION_EXPENSE:${currency}`;
}

export function depositCreditSourceKey(depositId: string): string {
  return `DEPOSIT:${depositId}:CREDIT`;
}

export function packageActivationSourceKey(depositId: string): string {
  return `DEPOSIT:${depositId}:PACKAGE_ACTIVATION`;
}

export function referralCommissionSourceKey(
  subscriptionId: string,
  level: number,
  receiverUserId: string,
): string {
  return `SUBSCRIPTION:${subscriptionId}:REFERRAL_COMMISSION:L${level}:${receiverUserId}`;
}
