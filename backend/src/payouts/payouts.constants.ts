export const PAYOUT_WALLET_BUCKETS = [
  'MAIN',
  'PACKAGE_EARNINGS',
  'REFERRAL_COMMISSION',
  'REWARDS',
] as const;

export type PayoutWalletBucket = (typeof PAYOUT_WALLET_BUCKETS)[number];

export const PAYOUT_BUCKETS = [
  ...PAYOUT_WALLET_BUCKETS,
  'TOTAL_WALLET',
] as const;

export type PayoutBucket = (typeof PAYOUT_BUCKETS)[number];

// Global payout invariant: every NEW USER payout consumes Total Wallet only.
// Legacy component bucket values remain valid immutable payout snapshots.
export const PAYOUT_SPENDABLE_BUCKETS = ['TOTAL_WALLET'] as const;

export function isPayoutWalletBucket(
  value: PayoutBucket,
): value is PayoutWalletBucket {
  return PAYOUT_WALLET_BUCKETS.includes(value as PayoutWalletBucket);
}

export const PAYOUT_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'SUBMITTED',
  'COMPLETED',
  'REJECTED',
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_POLICY_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type PayoutPolicyStatus = (typeof PAYOUT_POLICY_STATUSES)[number];

export const PAYOUT_VALIDATION_PROFILES = ['TRON', 'EVM', 'SOLANA'] as const;
export type PayoutValidationProfile =
  (typeof PAYOUT_VALIDATION_PROFILES)[number];

export const PAYOUT_LEDGER_KINDS = {
  RESERVE: 'PAYOUT_RESERVE',
  RELEASE: 'PAYOUT_RELEASE',
  SETTLEMENT: 'PAYOUT_SETTLEMENT',
} as const;

export const PAYOUT_SYSTEM_BUCKETS = {
  TOTAL_WALLET_CONTROL: 'TOTAL_WALLET_CONTROL',
  RESERVE: 'PAYOUT_RESERVE',
  SETTLEMENT: 'PAYOUT_SETTLEMENT',
  FEE_REVENUE: 'PAYOUT_FEE_REVENUE',
} as const;

export const PAYOUT_AUDIT_OPERATIONS = {
  CREATE_DRAFT: 'CREATE_PAYOUT_POLICY_DRAFT',
  UPDATE_DRAFT: 'UPDATE_PAYOUT_POLICY_DRAFT',
  PUBLISH_POLICY: 'PUBLISH_PAYOUT_POLICY',
  CREATE_REQUEST: 'CREATE_PAYOUT_REQUEST',
  APPROVE: 'APPROVE_PAYOUT_REQUEST',
  REJECT: 'REJECT_PAYOUT_REQUEST',
  SUBMIT_TXID: 'SUBMIT_PAYOUT_TXID',
  COMPLETE: 'COMPLETE_PAYOUT_REQUEST',
  RESERVE: 'RESERVE_PAYOUT_FUNDS',
  RELEASE: 'RELEASE_PAYOUT_FUNDS',
  SETTLE: 'SETTLE_PAYOUT_FUNDS',
} as const;

export function payoutReserveSourceKey(payoutId: string): string {
  return `PAYOUT:${payoutId}:RESERVE`;
}

export function payoutReleaseSourceKey(payoutId: string): string {
  return `PAYOUT:${payoutId}:RELEASE`;
}

export function payoutSettlementSourceKey(payoutId: string): string {
  return `PAYOUT:${payoutId}:SETTLEMENT`;
}

export function payoutTotalWalletEventKey(
  payoutId: string,
  operation: 'RESERVE' | 'RELEASE',
): string {
  return `PAYOUT:${payoutId}:TOTAL_WALLET:${operation}`;
}

export function payoutReserveAccountKey(currency: string): string {
  return `SYSTEM:PAYOUT_RESERVE:${currency}`;
}

export function payoutSettlementAccountKey(currency: string): string {
  return `SYSTEM:PAYOUT_SETTLEMENT:${currency}`;
}

export function payoutFeeRevenueAccountKey(currency: string): string {
  return `SYSTEM:PAYOUT_FEE_REVENUE:${currency}`;
}

export function payoutUserAccountKey(
  userId: string,
  bucket: PayoutWalletBucket,
  currency: string,
): string {
  return `USER:${userId}:${bucket}:${currency}`;
}
