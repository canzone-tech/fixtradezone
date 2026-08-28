import { formatPlatformDateTime } from "@/lib/platform-time";

export interface WalletBuckets {
  main: string;
  packageEarnings: string;
  referralCommission: string;
  rewards: string;
}

export interface WalletCurrencySummary {
  currency: string;
  buckets: WalletBuckets;
  totalWallet: string;
}

export interface WalletActivity {
  transactionId: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  description: string;
  currency: string;
  postedAt: string;
  bucket: "MAIN" | "PACKAGE_EARNINGS" | "REFERRAL_COMMISSION" | "REWARDS";
  direction: "CREDIT" | "DEBIT";
  amount: string;
}

export interface UserWalletResponse {
  wallets: WalletCurrencySummary[];
  activity: WalletActivity[];
  page: number;
  limit: number;
  totalActivity: number;
}

export interface AdminWalletSummary {
  userId: string;
  username: string;
  email: string | null;
  currency: string;
  buckets: WalletBuckets;
  totalWallet: string;
}

export interface AdminWalletsResponse {
  page: number;
  limit: number;
  total: number;
  wallets: AdminWalletSummary[];
}

export type LedgerTransactionKind =
  | "DEPOSIT_CREDIT"
  | "PACKAGE_ACTIVATION_FUNDING"
  | "REFERRAL_COMMISSION_CREDIT"
  | "PACKAGE_REWARD_CREDIT";

export interface LedgerTransaction {
  id: string;
  kind: LedgerTransactionKind;
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  currency: string;
  postedByUserId: string | null;
  description: string;
  metadata: unknown;
  postedAt: string;
  createdAt: string;
}

export interface AdminLedgerResponse {
  page: number;
  limit: number;
  total: number;
  transactions: LedgerTransaction[];
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  accountKey?: string;
  ownerType?: "SYSTEM" | "USER";
  ownerUserId?: string | null;
  bucket?: string;
  currency?: string;
  side: "DEBIT" | "CREDIT";
  amount: string;
  memo: string | null;
  createdAt: string;
}

export interface LedgerDetailResponse {
  transaction: LedgerTransaction;
  entries: LedgerEntry[];
  balanced: boolean;
}

export interface UnpostedApprovedDeposit {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  amount: string;
  currency: string;
  assignedNetwork: string;
  txid: string | null;
  reviewedAt: string | null;
}

export interface ReconciliationResponse {
  page: number;
  limit: number;
  total: number;
  deposits: UnpostedApprovedDeposit[];
}

export interface LedgerMutationResponse {
  message: string;
  created: boolean;
  transaction: LedgerTransaction;
}

export interface ApiMessagePayload {
  message?: string;
  error?: string;
}

export async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function messageFrom(
  payload: ApiMessagePayload | null | undefined,
  fallback: string,
): string {
  return payload?.message || payload?.error || fallback;
}

export function compactDecimal(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatWalletDate(value: string | null): string {
  return formatPlatformDateTime(value);
}
