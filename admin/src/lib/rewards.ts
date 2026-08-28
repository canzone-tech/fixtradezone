export type RewardPolicyStatus = "DRAFT" | "PUBLISHED";
export type ExistingSubscriptionRolloutMode =
  | "RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE"
  | "FORWARD_ONLY_FROM_POLICY_EFFECTIVE";
export type PackageRewardStateStatus = "ACTIVE" | "COMPLETED" | "BLOCKED";
export type PackageRewardCompletionReason =
  | "CAP_REACHED"
  | "LIFETIME_REACHED";

export interface RewardPolicy {
  id: string;
  versionNumber: number;
  status: RewardPolicyStatus;
  revision: number;
  existingSubscriptionRolloutMode: ExistingSubscriptionRolloutMode;
  packageRewardCountsTowardCap: boolean;
  referralCommissionCountsTowardCap: boolean;
  teamCommissionCountsTowardCap: boolean;
  awardRewardCountsTowardCap: boolean;
  otherIncomeCountsTowardCap: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  clonedFromPolicyVersionId: string | null;
}

export interface PackageRewardState {
  subscriptionId: string;
  userId: string;
  username?: string;
  email?: string | null;
  packageDisplayName?: string;
  rewardCapPolicyVersionId: string;
  currency: string;
  packageValue: string;
  capBasis: string;
  capMultiplier: string;
  principalTreatment: string;
  capLimit: string;
  capConsumed: string;
  capRemaining: string;
  packageRewardCountsTowardCap: boolean;
  referralCommissionCountsTowardCap: boolean;
  teamCommissionCountsTowardCap: boolean;
  awardRewardCountsTowardCap: boolean;
  otherIncomeCountsTowardCap: boolean;
  nextRewardLocalDate: string;
  nextRewardAt: string;
  nextRewardDayNumber: number;
  nextCycleNumber: number;
  nextCycleDay: number;
  settledRewardCount: number;
  status: PackageRewardStateStatus;
  completionReason: PackageRewardCompletionReason | null;
  blockedReason: string | null;
  revision: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PackageRewardEvent {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  userId: string;
  username?: string;
  email?: string | null;
  rewardCapPolicyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  packageValue: string;
  currency: string;
  rewardLocalDate: string;
  rewardDayNumber: number;
  cycleNumber: number;
  cycleDay: number;
  settlementTimezone: string;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  rewardRateMode: string;
  rewardRateMeaning: string;
  selectedRate: string;
  calculatedReward: string;
  postedReward: string;
  capBasis: string;
  capMultiplier: string;
  principalTreatment: string;
  capLimit: string;
  capConsumedBefore: string;
  capConsumedAfter: string;
  clippedToCap: boolean;
  existingSubscriptionRolloutMode: ExistingSubscriptionRolloutMode;
  packageRewardCountsTowardCap: boolean;
  referralCommissionCountsTowardCap: boolean;
  teamCommissionCountsTowardCap: boolean;
  awardRewardCountsTowardCap: boolean;
  otherIncomeCountsTowardCap: boolean;
  cycleDays: number;
  goalDays: number;
  cycleEndAction: string;
  capReachedAction: string;
  ledgerTransactionId: string;
  completionReason: PackageRewardCompletionReason | null;
  postedAt: string;
  createdAt: string;
}

export interface MyRewardsResponse {
  states: PackageRewardState[];
  events: PackageRewardEvent[];
  page: number;
  limit: number;
  total: number;
}

export interface RewardReconciliationItem {
  subscriptionId: string;
  userId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  currency: string;
  packageValue: string;
  activatedAt: string;
  stateStatus: PackageRewardStateStatus | "UNINITIALIZED";
  nextRewardAt: string | null;
  blockedReason: string | null;
}

export interface RewardWorkerHealth {
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  infrastructureEnabled: boolean;
  operationsMode: "AUTOMATIC" | "CONTROLLED_MANUAL";
  platformTimezone: string;
  automaticProcessingEnabled: boolean;
  intervalMs: number;
  lastSummary: {
    asOf: string;
    initialized: number;
    processedSubscriptions: number;
    createdEvents: number;
    completedSubscriptions: number;
    blockedSubscriptions: number;
    remainingDue: number;
  } | null;
}
