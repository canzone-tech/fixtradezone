export const SIMULATED_ACTIVITY_POLICY_STATUSES = [
  'DRAFT',
  'PUBLISHED',
] as const;

export type SimulatedActivityPolicyStatus =
  (typeof SIMULATED_ACTIVITY_POLICY_STATUSES)[number];

export const SIMULATED_ACTIVITY_OUTCOMES = ['WIN', 'LOSS'] as const;
export type SimulatedActivityOutcome =
  (typeof SIMULATED_ACTIVITY_OUTCOMES)[number];

export const SIMULATED_ACTIVITY_GENERATION_SOURCES = [
  'WORKER',
  'RECONCILIATION',
] as const;
export type SimulatedActivityGenerationSource =
  (typeof SIMULATED_ACTIVITY_GENERATION_SOURCES)[number];

export const SIMULATED_ACTIVITY_DEFAULT_PER_DAY = 5;
export const SIMULATED_ACTIVITY_MAX_PER_DAY = 50;
export const SIMULATED_ACTIVITY_PERCENT_DECIMAL_PLACES = 6;
export const SIMULATED_ACTIVITY_DEFAULT_INTERVAL_MS = 60_000;
export const SIMULATED_ACTIVITY_WORKER_LOCK_KEY =
  'fixtradezone:simulated-activity:worker';
export const SIMULATED_ACTIVITY_WORKER_MIN_LOCK_TTL_MS = 15 * 60_000;
export const SIMULATED_ACTIVITY_BATCH_LIMIT = 250;

export const SIMULATED_ACTIVITY_DISCLOSURE =
  'SIMULATED RESULTS — NOT REAL TRADING';

export interface SimulatedTimingWindow {
  start: string;
  end: string;
}

export function simulatedActivitySourceKey(
  subscriptionId: string,
  policyVersionId: string,
  localActivityDate: string,
  slotNumber: number,
): string {
  return `SUBSCRIPTION:${subscriptionId}:SIMULATED_ACTIVITY:POLICY:${policyVersionId}:${localActivityDate}:${slotNumber}`;
}
