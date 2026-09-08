import { formatPlatformDateTime } from "@/lib/platform-time";

export const PAYOUT_BUCKETS = [
  "MAIN",
  "PACKAGE_EARNINGS",
  "REFERRAL_COMMISSION",
  "REWARDS",
] as const;

export type PayoutBucket = (typeof PAYOUT_BUCKETS)[number];

export type PayoutStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "SUBMITTED"
  | "COMPLETED"
  | "REJECTED";

export type PayoutValidationProfile = "TRON" | "EVM" | "SOLANA";

export interface PayoutPolicy {
  id: string;
  versionNumber: number;
  status: "DRAFT" | "PUBLISHED";
  revision: number;
  requestsEnabled: boolean;
  asset: string;
  networkCode: string;
  validationProfile: PayoutValidationProfile;
  minimumAmount: string | null;
  maximumAmount: string | null;
  fixedFeeAmount: string;
  percentageFee: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  enabledBuckets?: PayoutBucket[];
}

export interface CurrentPayoutPolicyResponse {
  available: boolean;
  requestsEnabled: boolean;
  policy: PayoutPolicy | null;
  enabledBuckets: PayoutBucket[];
}

export interface PayoutRequest {
  id: string;
  userId: string;
  requestKey: string;
  policyVersionId: string;
  sourceBucket: PayoutBucket;
  asset: string;
  networkCode: string;
  validationProfile: PayoutValidationProfile;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  destinationAddress: string;
  status: PayoutStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  externalTxid: string | null;
  submittedByUserId: string | null;
  submittedAt: string | null;
  completedByUserId: string | null;
  completedAt: string | null;
  reserveLedgerTransactionId: string | null;
  releaseLedgerTransactionId: string | null;
  settlementLedgerTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPayoutRequest extends PayoutRequest {
  username: string;
  email: string | null;
}

export interface UserPayoutsResponse {
  page: number;
  limit: number;
  total: number;
  payouts: PayoutRequest[];
}

export interface AdminPayoutsResponse {
  page: number;
  limit: number;
  total: number;
  payouts: AdminPayoutRequest[];
}

export interface PayoutPoliciesResponse {
  page: number;
  limit: number;
  total: number;
  policies: PayoutPolicy[];
}

export interface PayoutMutationResponse {
  created?: boolean;
  payout?: PayoutRequest;
  id?: string;
  status?: PayoutStatus;
  message?: string;
  error?: string;
}

export interface ApiMessagePayload {
  message?: string;
  error?: string;
  redirectTo?: string | null;
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

export function compactPayoutDecimal(value: string | null): string {
  if (value === null) return "—";
  if (!value.includes(".")) return value;
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function formatPayoutDate(value: string | null): string {
  return formatPlatformDateTime(value);
}

export function payoutBucketLabel(bucket: PayoutBucket): string {
  if (bucket === "MAIN") return "Main / Deposit";
  if (bucket === "PACKAGE_EARNINGS") return "Package Earnings";
  if (bucket === "REFERRAL_COMMISSION") return "Referral Commission";
  return "Rewards";
}

export function payoutStatusTone(
  status: PayoutStatus,
): "success" | "warning" | "neutral" {
  if (status === "COMPLETED") return "success";
  if (status === "PENDING_REVIEW" || status === "APPROVED") return "warning";
  return "neutral";
}
