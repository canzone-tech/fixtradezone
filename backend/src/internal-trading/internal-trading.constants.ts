export const INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY = 5;

export const INTERNAL_TRADING_POLICY_STATUSES = ['DRAFT', 'PUBLISHED'] as const;

export type InternalTradingPolicyStatus =
  (typeof INTERNAL_TRADING_POLICY_STATUSES)[number];

export interface InternalTradingTimingWindow {
  start: string;
  end: string;
}
