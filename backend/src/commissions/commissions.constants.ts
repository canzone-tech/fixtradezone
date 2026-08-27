export const COMMISSION_PLAN_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type CommissionPlanStatus = (typeof COMMISSION_PLAN_STATUSES)[number];

export const COMMISSION_UPGRADE_BASE_MODES = ['FULL', 'INCREMENTAL'] as const;
export type CommissionUpgradeBaseMode =
  (typeof COMMISSION_UPGRADE_BASE_MODES)[number];

export const INACTIVE_UPLINE_ACTIONS = ['LOST', 'PENDING', 'PASS_UP'] as const;
export type InactiveUplineAction = (typeof INACTIVE_UPLINE_ACTIONS)[number];

export const COMMISSION_COMPRESSION_MODES = [
  'SKIP',
  'PASS_SAME_LEVEL',
  'COMPRESS_LEVELS',
  'PENDING',
] as const;
export type CommissionCompressionMode =
  (typeof COMMISSION_COMPRESSION_MODES)[number];

export const COMMISSION_RELEASE_MODES = [
  'IMMEDIATE',
  'HOLD_PERIOD',
  'MANUAL_APPROVAL',
  'CONDITION_BASED',
] as const;
export type CommissionReleaseMode = (typeof COMMISSION_RELEASE_MODES)[number];

export const COMMISSION_EVENT_STATUSES = ['AVAILABLE', 'PENDING', 'LOST'] as const;
export type CommissionEventStatus = (typeof COMMISSION_EVENT_STATUSES)[number];

export const COMMISSION_RUN_OUTCOMES = [
  'PROCESSED',
  'NO_EFFECTIVE_PLAN',
  'NO_SPONSOR',
] as const;
export type CommissionRunOutcome = (typeof COMMISSION_RUN_OUTCOMES)[number];

export const COMMISSION_AUDIT_OPERATIONS = {
  UPDATE_DRAFT: 'UPDATE_REFERRAL_COMMISSION_PLAN_DRAFT',
  CLONE_DRAFT: 'CLONE_REFERRAL_COMMISSION_PLAN_DRAFT',
  PUBLISH_PLAN: 'PUBLISH_REFERRAL_COMMISSION_PLAN',
  PROCESS_SUBSCRIPTION: 'PROCESS_REFERRAL_COMMISSION_FROM_SUBSCRIPTION',
  RECONCILE_SUBSCRIPTION: 'RECONCILE_REFERRAL_COMMISSION_FROM_SUBSCRIPTION',
} as const;

export const INITIAL_EXECUTABLE_COMMISSION_POLICY = {
  inactiveUplineAction: 'LOST',
  compressionMode: 'SKIP',
  releaseMode: 'IMMEDIATE',
} as const;
