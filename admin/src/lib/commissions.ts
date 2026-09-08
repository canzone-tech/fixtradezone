export type CommissionPlanStatus = "DRAFT" | "PUBLISHED";
export type CommissionInactiveUplineAction = "LOST" | "PENDING" | "PASS_UP";
export type CommissionCompressionMode =
  "SKIP" | "PASS_SAME_LEVEL" | "COMPRESS_LEVELS" | "PENDING";
export type CommissionReleaseMode =
  "IMMEDIATE" | "HOLD_PERIOD" | "MANUAL_APPROVAL" | "CONDITION_BASED";

export interface CommissionLevelRule {
  id?: string;
  level: number;
  enabled: boolean;
  ratePercent: string;
  packageMatchingEnabled: boolean;
}

export interface CommissionPlan {
  id: string;
  versionNumber: number;
  status: CommissionPlanStatus;
  revision: number;
  firstPurchaseEnabled: boolean;
  newPurchaseEnabled: boolean;
  renewalEnabled: boolean;
  upgradeEnabled: boolean;
  upgradeBaseMode: "FULL" | "INCREMENTAL";
  activePackageRequired: boolean;
  inactiveUplineAction: CommissionInactiveUplineAction;
  compressionMode: CommissionCompressionMode;
  releaseMode: CommissionReleaseMode;
  holdPeriodHours: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  clonedFromPlanVersionId: string | null;
  levels: CommissionLevelRule[];
}

export interface CommissionEvent {
  id: string;
  runId: string;
  sourceSubscriptionId: string;
  receiverUserId: string;
  receiverUsername?: string;
  receiverEmail?: string | null;
  purchaserUserId: string;
  purchaserUsername?: string;
  purchaserEmail?: string | null;
  commissionPlanVersionId: string;
  level: number;
  sourceKey: string;
  sourcePackageDisplayName?: string;
  currency: string;
  sourcePackageValue: string;
  receiverPackageBasis: string;
  packageMatchingEnabled: boolean;
  eligibleBase: string;
  ratePercent: string;
  commissionAmount: string;
  releaseMode: CommissionReleaseMode;
  status: "AVAILABLE" | "PENDING" | "LOST";
  ineligibilityReason: string | null;
  ledgerTransactionId: string | null;
  availableAt: string | null;
  createdAt: string;
}

export interface CommissionReconciliationItem {
  subscriptionId: string;
  purchaserUserId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  price: string;
  currency: string;
  activatedAt: string;
}

export interface MyCommissionsResponse {
  balances: Array<{
    currency: string;
    referralCommission: string;
  }>;
  events: CommissionEvent[];
  page: number;
  limit: number;
  total: number;
}
