import type { PackagePlanItem } from "@/lib/packages";

export type DepositStatus =
  | "AWAITING_TXID"
  | "PENDING_REVIEW"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type DepositValidationProfile = "TRON" | "EVM" | "SOLANA";

export const DEPOSIT_VALIDATION_PROFILES: DepositValidationProfile[] = [
  "TRON",
  "EVM",
  "SOLANA",
];

export interface DepositPaymentRail {
  id: string;
  asset: string;
  networkCode: string;
  displayName: string;
  validationProfile: DepositValidationProfile;
  isActive: boolean;
  revision: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DepositAccount {
  id: string;
  label: string;
  paymentRailId: string;
  asset: string;
  network: string;
  walletAddress: string;
  qrCodeDataUrl: string;
  isActive: boolean;
  revision: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  paymentRail: DepositPaymentRail;
}

export interface DepositUserSummary {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface Deposit {
  id: string;
  userId: string;
  status: DepositStatus;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  amount: string;
  packageMinimumInvestment: string | null;
  packageMaximumInvestment: string | null;
  packageDurationDays: number | null;
  packagePrincipalTreatment: string | null;
  currency: string;
  assignedDepositAccountId: string;
  assignedAccountLabel: string;
  assignedWalletAddress: string;
  assignedNetwork: string;
  assignedValidationProfile: DepositValidationProfile;
  assignedQrCodeDataUrl: string;
  txid: string | null;
  submittedAt: string | null;
  readyForApprovalByUserId: string | null;
  readyForApprovalAt: string | null;
  readyForApprovalNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  user?: DepositUserSummary;
  readyForApprovalBy?: {
    id: string;
    username: string;
    email: string | null;
  } | null;
  reviewedBy?: {
    id: string;
    username: string;
    email: string | null;
  } | null;
}

export interface DepositPaymentRailsResponse {
  rails: DepositPaymentRail[];
}

export interface DepositAccountsResponse {
  accounts: DepositAccount[];
}

export interface DepositsResponse {
  deposits: Deposit[];
  page?: number;
  limit?: number;
  total?: number;
}

export interface PackageActivationOutcome {
  activationMode?: "AUTO" | "MANUAL" | "DEFERRED";
  activationTrigger?: string;
  activePackageMode?: string;
  activationApplied?: boolean;
  activationRequired?: boolean;
  message?: string;
  subscription?: {
    id: string;
    status: string;
    packageDisplayName?: string;
  };
}

export interface DepositMutationResponse {
  message: string;
  deposit: Deposit;
  alreadyApproved?: boolean;
  accountingPostingMode?: "AUTO_ON_APPROVAL" | "MANUAL_RECONCILIATION";
  accountingPosted?: boolean;
  packageActivated?: boolean;
  packageActivationMode?: "AUTO" | "MANUAL" | "DEFERRED";
  packageActivationTrigger?: string;
  packageActivationRequired?: boolean;
  subscription?: {
    id: string;
    status: string;
    packageDisplayName?: string;
  };
}

export interface DepositBulkApprovalResponse extends ApiMessagePayload {
  message?: string;
  approved: number;
  failed: number;
  results: Array<{
    depositId: string;
    ok: boolean;
    message: string;
    status?: string;
    accountingPosted?: boolean;
    packageActivated?: boolean;
  }>;
}

export interface DepositAccountingResponse extends ApiMessagePayload {
  packageActivation?: PackageActivationOutcome;
}

export interface DepositAccountMutationResponse {
  message: string;
  account: DepositAccount;
}

export interface DepositPaymentRailMutationResponse {
  message: string;
  rail: DepositPaymentRail;
}

export interface DepositPackageCatalogue {
  catalogueAvailable: boolean;
  items: PackagePlanItem[];
}

export interface ApiMessagePayload {
  message?: string | string[];
  redirectTo?: string;
}

export async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function messageFrom(
  payload: ApiMessagePayload | null,
  fallback: string,
): string {
  if (!payload?.message) return fallback;
  return Array.isArray(payload.message)
    ? payload.message.join(" ")
    : payload.message;
}

export function compactDecimal(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function addUnsignedIntegerStrings(left: string, right: string): string {
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;
  let carry = 0;
  let result = "";

  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const leftDigit = leftIndex >= 0 ? Number(left[leftIndex]) : 0;
    const rightDigit = rightIndex >= 0 ? Number(right[rightIndex]) : 0;
    const sum = leftDigit + rightDigit + carry;

    result = `${sum % 10}${result}`;
    carry = Math.floor(sum / 10);
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return result.replace(/^0+(?=\d)/, "") || "0";
}

export function sumDecimalStrings(values: string[]): string {
  const decimalPlaces = 8;
  let total = "0";

  for (const value of values) {
    const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(value);
    if (!match) throw new Error(`Invalid decimal amount: ${value}`);

    const whole = match[1];
    const fraction = (match[2] ?? "").padEnd(decimalPlaces, "0");
    const scaled = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
    total = addUnsignedIntegerStrings(total, scaled);
  }

  const padded = total.padStart(decimalPlaces + 1, "0");
  const whole = padded.slice(0, -decimalPlaces).replace(/^0+(?=\d)/, "") || "0";
  const fraction = padded.slice(-decimalPlaces).replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole;
}

export function normalizeTransactionId(
  profile: DepositValidationProfile,
  value: string,
): string | null {
  const trimmed = value.trim();

  if (profile === "TRON") {
    return /^[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
  }

  if (profile === "EVM") {
    if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(trimmed)) return null;
    return trimmed.toLowerCase().replace(/^0x/, "");
  }

  if (profile === "SOLANA") {
    return /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(trimmed) ? trimmed : null;
  }

  return null;
}

export function transactionIdHint(
  profile: DepositValidationProfile,
  networkCode: string,
): string {
  if (profile === "SOLANA") {
    return `${networkCode} transaction signature`;
  }

  if (profile === "TRON") {
    return `${networkCode} transaction ID (64 hex characters)`;
  }

  return `${networkCode} EVM transaction hash (0x prefix optional)`;
}

export function statusLabel(status: DepositStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function statusTone(status: DepositStatus): string {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "PENDING_REVIEW":
      return "warning";
    case "READY_FOR_APPROVAL":
      return "info";
    default:
      return "info";
  }
}