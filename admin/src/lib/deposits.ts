import type { PackagePlanItem } from "@/lib/packages";

export type DepositStatus =
  | "AWAITING_TXID"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED";

export const DEPOSIT_NETWORKS = [
  "TRC20",
  "ERC20",
  "BEP20",
  "POLYGON",
  "ARBITRUM",
  "BASE",
  "OPTIMISM",
  "SOLANA",
] as const;

export type DepositNetwork = (typeof DEPOSIT_NETWORKS)[number];

export interface DepositAccount {
  id: string;
  label: string;
  asset: string;
  network: DepositNetwork;
  walletAddress: string;
  qrCodeDataUrl: string;
  isActive: boolean;
  revision: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
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
  currency: string;
  assignedDepositAccountId: string;
  assignedAccountLabel: string;
  assignedWalletAddress: string;
  assignedNetwork: DepositNetwork;
  assignedQrCodeDataUrl: string;
  txid: string | null;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  user?: DepositUserSummary;
  reviewedBy?: {
    id: string;
    username: string;
    email: string | null;
  } | null;
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

export interface DepositMutationResponse {
  message: string;
  deposit: Deposit;
}

export interface DepositAccountMutationResponse {
  message: string;
  account: DepositAccount;
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

export function normalizeTransactionId(
  network: DepositNetwork,
  value: string,
): string | null {
  const trimmed = value.trim();

  if (network === "TRC20") {
    return /^[0-9a-fA-F]{64}$/.test(trimmed) ? trimmed.toLowerCase() : null;
  }

  if (
    ["ERC20", "BEP20", "POLYGON", "ARBITRUM", "BASE", "OPTIMISM"].includes(
      network,
    )
  ) {
    if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(trimmed)) return null;
    return trimmed.toLowerCase().replace(/^0x/, "");
  }

  if (network === "SOLANA") {
    return /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(trimmed) ? trimmed : null;
  }

  return null;
}

export function transactionIdHint(network: DepositNetwork): string {
  if (network === "SOLANA") {
    return "Solana transaction signature";
  }

  if (network === "TRC20") {
    return "64-character TRON transaction ID";
  }

  return "EVM transaction hash (0x prefix optional)";
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
    default:
      return "info";
  }
}
