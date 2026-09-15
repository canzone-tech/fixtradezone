export const AWARD_POLICY_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type AwardPolicyStatus = (typeof AWARD_POLICY_STATUSES)[number];

export const AWARD_USER_TRACK_STATUSES = [
  'ACTIVE_TRACK',
  'QUALIFIED',
  'AWARD_POSTED',
  'CLOSED',
] as const;
export type AwardUserTrackStatus = (typeof AWARD_USER_TRACK_STATUSES)[number];

export const AWARD_REWARD_DEFAULT_ASSET = 'USDT';
export const AWARD_REWARD_WORKER_DEFAULT_INTERVAL_MS = 60_000;
export const AWARD_REWARD_WORKER_LOCK_KEY =
  'fixtradezone:award-reward:reconciliation-worker';

export const AWARD_REWARD_AUDIT_OPERATIONS = {
  CREATE_POLICY_DRAFT: 'CREATE_AWARD_REWARD_POLICY_DRAFT',
  UPDATE_POLICY_DRAFT: 'UPDATE_AWARD_REWARD_POLICY_DRAFT',
  PUBLISH_POLICY: 'PUBLISH_AWARD_REWARD_POLICY',
  START_TRACK: 'START_AWARD_REWARD_TRACK',
  UPDATE_PROGRESS: 'UPDATE_AWARD_REWARD_PROGRESS',
  POST_AWARD: 'POST_AWARD_REWARD',
  CLOSE_TRACK: 'CLOSE_AWARD_REWARD_TRACK',
  RECONCILE: 'RECONCILE_AWARD_REWARD',
  AUTO_RECONCILE: 'AUTO_RECONCILE_AWARD_REWARD',
} as const;

export function awardRewardSourceKey(userTrackId: string): string {
  return `AWARD_TRACK:${userTrackId}:CREDIT`;
}

export function awardRewardExpenseAccountKey(currency: string): string {
  return `SYSTEM:AWARD_REWARD_EXPENSE:${currency}`;
}
