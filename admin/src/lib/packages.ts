export const ACTIVE_PACKAGE_MODES = [
  "SINGLE_ACTIVE",
  "MULTIPLE_ACTIVE",
] as const;

export const MULTIPLE_ACTIVE_PACKAGE_BASES = [
  "HIGHEST_ACTIVE_PACKAGE",
  "TOTAL_ACTIVE_PACKAGE_VALUE",
  "PRIMARY_PACKAGE",
] as const;

export const PACKAGE_ACTIVATION_TRIGGERS = [
  "PAYMENT_SUBMITTED",
  "PAYMENT_APPROVED",
  "MANUAL_ACTIVATION",
  "RULE_BASED",
] as const;

export const PACKAGE_PLAN_MIGRATION_MODES = [
  "NEW_ENROLLMENTS_ONLY",
  "NEW_PACKAGE_ACTIVATIONS",
  "ALL_FUTURE_EVENTS",
  "EFFECTIVE_DATE",
] as const;

export const PACKAGE_RENEWAL_MODES = [
  "MANUAL_AFTER_TERMINAL",
  "AUTO_RENEWAL",
  "DISABLED",
] as const;

export const PACKAGE_AVAILABILITIES = [
  "AVAILABLE",
  "HIDDEN",
  "CLOSED_TO_NEW_ACTIVATIONS",
] as const;

export const PACKAGE_REWARD_RATE_MODES = [
  "FIXED",
  "RANDOM_RANGE",
  "MANUAL",
  "RULE_BASED",
] as const;

export const PACKAGE_REWARD_RATE_MEANINGS = [
  "GROSS_BEFORE_SPLIT",
  "USER_NET_AFTER_SPLIT",
] as const;

export const PACKAGE_CAP_BASES = ["TOTAL_RETURN", "PROFIT_ONLY"] as const;

export const PACKAGE_PRINCIPAL_TREATMENTS = [
  "RETURN_SEPARATELY",
  "INCLUDED_IN_TOTAL_RETURN",
  "NON_REFUNDABLE_PACKAGE_VALUE",
] as const;

export const PACKAGE_REWARD_START_MODES = [
  "SAME_DAY",
  "NEXT_CALENDAR_DAY",
  "AFTER_FULL_INTERVAL",
  "CONFIGURED_START_TIME",
  "NEXT_CYCLE_START",
] as const;

export const PACKAGE_REWARD_FREQUENCIES = [
  "DAILY_CALENDAR",
  "CONFIGURED_DAYS",
  "PER_CYCLE",
  "PER_EVENT",
] as const;

export const PACKAGE_CYCLE_DAY_MODES = [
  "CALENDAR_DAYS",
  "ELIGIBLE_EARNING_DAYS",
] as const;

export const PACKAGE_REWARD_DAY_MODES = [
  "EVERY_DAY",
  "SELECTED_WEEKDAYS",
  "CUSTOM_CALENDAR",
] as const;

export const PACKAGE_CYCLE_END_ACTIONS = [
  "COMPLETE_PACKAGE",
  "AUTO_START_NEXT_CYCLE",
  "MANUAL_RESTART",
  "PAUSE_UNTIL_CONDITION",
] as const;

export const PACKAGE_CAP_REACHED_ACTIONS = [
  "COMPLETE_PACKAGE",
  "STOP_EARNINGS_KEEP_ACTIVE",
  "AUTO_RENEW",
  "MANUAL_RENEW",
  "PAUSE",
] as const;

export type PackagePlanStatus = "DRAFT" | "PUBLISHED";
export type PackageAvailability = (typeof PACKAGE_AVAILABILITIES)[number];
export type PackageRewardRateMode = (typeof PACKAGE_REWARD_RATE_MODES)[number];

export interface PackagePlanItem {
  id: string;
  packageDefinitionId: string;
  packageCode: string;
  displayName: string;
  slug: string;
  sortOrder: number;
  availability: PackageAvailability;
  price: string;
  currency: string;
  rewardRateMode: PackageRewardRateMode;
  fixedRewardRate: string | null;
  minimumRewardRate: string | null;
  maximumRewardRate: string | null;
  rewardRateMeaning: string;
  capBasis: string;
  capMultiplier: string;
  principalTreatment: string;
  maximumTotalReturn: string;
  maximumProfit: string;
  goalDays: number;
  cycleDays: number;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  cycleEndAction: string;
  capReachedAction: string;
  createdAt: string;
  updatedAt: string;
}

export interface PackagePlanSummary {
  id: string;
  versionNumber: number;
  status: PackagePlanStatus;
  revision: number;
  activePackageMode: string;
  multipleActivePackageBasis: string;
  activationTrigger: string;
  migrationMode: string;
  renewalMode: string;
  upgradesEnabled: boolean;
  settlementTimezone: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  clonedFromPlanVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface PackagePlan extends Omit<PackagePlanSummary, "itemCount"> {
  items: PackagePlanItem[];
}

export interface PackageCatalogue {
  catalogueAvailable: boolean;
  activationAvailable: false;
  reason: "NO_EFFECTIVE_PUBLISHED_PLAN" | "PACKAGE_ACTIVATION_DEFERRED";
  plan: Omit<
    PackagePlan,
    | "status"
    | "revision"
    | "publishedAt"
    | "clonedFromPlanVersionId"
    | "createdByUserId"
    | "updatedByUserId"
    | "publishedByUserId"
    | "createdAt"
    | "updatedAt"
    | "items"
  > | null;
  items: PackagePlanItem[];
}

export interface ApiErrorPayload {
  message?: string | string[];
  redirectTo?: string;
}

export async function readApiPayload<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function apiMessage(
  payload: ApiErrorPayload | null,
  fallback: string,
): string {
  if (!payload?.message) {
    return fallback;
  }

  return Array.isArray(payload.message)
    ? payload.message.join(" ")
    : payload.message;
}

export function decimalLabel(value: string): string {
  if (!value.includes(".")) {
    return value;
  }

  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed || "0";
}

export function enumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function rewardRateLabel(item: PackagePlanItem): string {
  if (item.rewardRateMode === "FIXED") {
    return `${decimalLabel(item.fixedRewardRate ?? "0")}%`;
  }

  return `${decimalLabel(item.minimumRewardRate ?? "0")}–${decimalLabel(
    item.maximumRewardRate ?? "0",
  )}%`;
}
