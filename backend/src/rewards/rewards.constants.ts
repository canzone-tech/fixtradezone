export const REWARD_POLICY_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type RewardPolicyStatus = (typeof REWARD_POLICY_STATUSES)[number];

export const EXISTING_SUBSCRIPTION_ROLLOUT_MODES = [
  'RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE',
  'FORWARD_ONLY_FROM_POLICY_EFFECTIVE',
] as const;
export type ExistingSubscriptionRolloutMode =
  (typeof EXISTING_SUBSCRIPTION_ROLLOUT_MODES)[number];

export const PACKAGE_REWARD_STATE_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'BLOCKED',
] as const;
export type PackageRewardStateStatus =
  (typeof PACKAGE_REWARD_STATE_STATUSES)[number];

export const PACKAGE_REWARD_COMPLETION_REASONS = [
  'CAP_REACHED',
  'LIFETIME_REACHED',
] as const;
export type PackageRewardCompletionReason =
  (typeof PACKAGE_REWARD_COMPLETION_REASONS)[number];

export const RWD01_EXECUTABLE_POLICY = {
  rolloutMode: 'FORWARD_ONLY_FROM_POLICY_EFFECTIVE',
  packageRewardCountsTowardCap: true,
  referralCommissionCountsTowardCap: false,
  teamCommissionCountsTowardCap: false,
  awardRewardCountsTowardCap: false,
  otherIncomeCountsTowardCap: false,
} as const;

export const RWD01_EXECUTABLE_SUBSCRIPTION_TERMS = {
  rewardRateModes: ['FIXED', 'RANDOM_RANGE'] as const,
  rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
  capBasis: 'TOTAL_RETURN',
  principalTreatment: 'INCLUDED_IN_TOTAL_RETURN',
  rewardStartMode: 'NEXT_CALENDAR_DAY',
  rewardFrequency: 'DAILY_CALENDAR',
  cycleDayMode: 'CALENDAR_DAYS',
  rewardDayMode: 'EVERY_DAY',
  cycleEndAction: 'AUTO_START_NEXT_CYCLE',
  capReachedAction: 'COMPLETE_PACKAGE',
} as const;

export const PACKAGE_REWARD_MONEY_DECIMAL_PLACES = 8;
export const PACKAGE_REWARD_RATE_DECIMAL_PLACES = 6;
export const MAX_REWARD_CATCHUP_EVENTS_PER_CALL = 31;
export const REWARD_WORKER_DEFAULT_INTERVAL_MS = 60_000;
export const REWARD_WORKER_LOCK_KEY = 'fixtradezone:rwd01:due-reward-worker';

export const REWARD_AUDIT_OPERATIONS = {
  UPDATE_POLICY_DRAFT: 'UPDATE_REWARD_CAP_POLICY_DRAFT',
  CLONE_POLICY_DRAFT: 'CLONE_REWARD_CAP_POLICY_DRAFT',
  PUBLISH_POLICY: 'PUBLISH_REWARD_CAP_POLICY',
  INITIALIZE_STATE: 'INITIALIZE_PACKAGE_REWARD_STATE',
  POST_REWARD: 'POST_PACKAGE_REWARD',
  RECONCILE_SUBSCRIPTION: 'RECONCILE_PACKAGE_REWARD_SUBSCRIPTION',
  PROCESS_DUE_BATCH: 'PROCESS_DUE_PACKAGE_REWARDS',
  AUTO_PROCESS_DUE_BATCH: 'AUTO_PROCESS_DUE_PACKAGE_REWARDS',
} as const;
