export const PACKAGE_CURRENCY = 'USDT' as const;

export const PACKAGE_PLAN_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export const ACTIVE_PACKAGE_MODES = [
  'SINGLE_ACTIVE',
  'MULTIPLE_ACTIVE',
] as const;

export const MULTIPLE_ACTIVE_PACKAGE_BASES = [
  'HIGHEST_ACTIVE_PACKAGE',
  'TOTAL_ACTIVE_PACKAGE_VALUE',
  'PRIMARY_PACKAGE',
] as const;

export const PACKAGE_ACTIVATION_TRIGGERS = [
  'PAYMENT_SUBMITTED',
  'PAYMENT_APPROVED',
  'MANUAL_ACTIVATION',
  'RULE_BASED',
] as const;

export const PACKAGE_PLAN_MIGRATION_MODES = [
  'NEW_ENROLLMENTS_ONLY',
  'NEW_PACKAGE_ACTIVATIONS',
  'ALL_FUTURE_EVENTS',
  'EFFECTIVE_DATE',
] as const;

export const PACKAGE_RENEWAL_MODES = [
  'MANUAL_AFTER_TERMINAL',
  'AUTO_RENEWAL',
  'DISABLED',
] as const;

export const PACKAGE_AVAILABILITIES = [
  'AVAILABLE',
  'HIDDEN',
  'CLOSED_TO_NEW_ACTIVATIONS',
] as const;

export const PACKAGE_REWARD_RATE_MODES = [
  'FIXED',
  'RANDOM_RANGE',
  'MANUAL',
  'RULE_BASED',
] as const;

export const PACKAGE_REWARD_RATE_MEANINGS = [
  'GROSS_BEFORE_SPLIT',
  'USER_NET_AFTER_SPLIT',
] as const;

export const PACKAGE_CAP_BASES = ['TOTAL_RETURN', 'PROFIT_ONLY'] as const;

export const PACKAGE_PRINCIPAL_TREATMENTS = [
  'RETURN_SEPARATELY',
  'INCLUDED_IN_TOTAL_RETURN',
  'NON_REFUNDABLE_PACKAGE_VALUE',
] as const;

export const PACKAGE_REWARD_START_MODES = [
  'SAME_DAY',
  'NEXT_CALENDAR_DAY',
  'AFTER_FULL_INTERVAL',
  'CONFIGURED_START_TIME',
  'NEXT_CYCLE_START',
] as const;

export const PACKAGE_REWARD_FREQUENCIES = [
  'DAILY_CALENDAR',
  'CONFIGURED_DAYS',
  'PER_CYCLE',
  'PER_EVENT',
] as const;

export const PACKAGE_CYCLE_DAY_MODES = [
  'CALENDAR_DAYS',
  'ELIGIBLE_EARNING_DAYS',
] as const;

export const PACKAGE_REWARD_DAY_MODES = [
  'EVERY_DAY',
  'SELECTED_WEEKDAYS',
  'CUSTOM_CALENDAR',
] as const;

export const PACKAGE_CYCLE_END_ACTIONS = [
  'COMPLETE_PACKAGE',
  'AUTO_START_NEXT_CYCLE',
  'MANUAL_RESTART',
  'PAUSE_UNTIL_CONDITION',
] as const;

export const PACKAGE_CAP_REACHED_ACTIONS = [
  'COMPLETE_PACKAGE',
  'STOP_EARNINGS_KEEP_ACTIVE',
  'AUTO_RENEW',
  'MANUAL_RENEW',
  'PAUSE',
] as const;

export type ActivePackageMode = (typeof ACTIVE_PACKAGE_MODES)[number];
export type MultipleActivePackageBasis =
  (typeof MULTIPLE_ACTIVE_PACKAGE_BASES)[number];
export type PackageActivationTrigger =
  (typeof PACKAGE_ACTIVATION_TRIGGERS)[number];
export type PackagePlanMigrationMode =
  (typeof PACKAGE_PLAN_MIGRATION_MODES)[number];
export type PackageRenewalMode = (typeof PACKAGE_RENEWAL_MODES)[number];
export type PackageAvailability = (typeof PACKAGE_AVAILABILITIES)[number];
export type PackageRewardRateMode = (typeof PACKAGE_REWARD_RATE_MODES)[number];
export type PackageRewardRateMeaning =
  (typeof PACKAGE_REWARD_RATE_MEANINGS)[number];
export type PackageCapBasis = (typeof PACKAGE_CAP_BASES)[number];
export type PackagePrincipalTreatment =
  (typeof PACKAGE_PRINCIPAL_TREATMENTS)[number];
export type PackageRewardStartMode =
  (typeof PACKAGE_REWARD_START_MODES)[number];
export type PackageRewardFrequency =
  (typeof PACKAGE_REWARD_FREQUENCIES)[number];
export type PackageCycleDayMode = (typeof PACKAGE_CYCLE_DAY_MODES)[number];
export type PackageRewardDayMode = (typeof PACKAGE_REWARD_DAY_MODES)[number];
export type PackageCycleEndAction = (typeof PACKAGE_CYCLE_END_ACTIONS)[number];
export type PackageCapReachedAction =
  (typeof PACKAGE_CAP_REACHED_ACTIONS)[number];
