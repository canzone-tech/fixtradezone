export const RANGE_PACKAGE_TECHNICAL_TERMS = {
  currency: "USDT",
  rewardRateMeaning: "USER_NET_AFTER_SPLIT",
  capBasis: "TOTAL_RETURN",
  rewardStartMode: "NEXT_CALENDAR_DAY",
  rewardFrequency: "DAILY_CALENDAR",
  cycleDayMode: "CALENDAR_DAYS",
  rewardDayMode: "EVERY_DAY",
  cycleEndAction: "COMPLETE_PACKAGE",
  capReachedAction: "COMPLETE_PACKAGE",
} as const;

const RATE_SCALE = 1_000_000n;
const MULTIPLIER_SCALE = 10_000n;

export function deriveRangeCompatibilityCapMultiplier(input: {
  rewardRateMode: string;
  fixedRewardRate: string;
  maximumRewardRate: string;
  durationDays: string;
}): string {
  const duration = BigInt(input.durationDays.trim());
  if (duration < 1n) {
    throw new Error("Duration must be at least one day.");
  }

  const upperRateText =
    input.rewardRateMode === "FIXED"
      ? input.fixedRewardRate
      : input.maximumRewardRate;
  const upperRate = parseRate(upperRateText);

  const numerator = upperRate * duration * MULTIPLIER_SCALE;
  const denominator = 100n * RATE_SCALE;
  const roundedProfitMultiplier =
    (numerator + denominator / 2n) / denominator;
  const scaled = MULTIPLIER_SCALE + roundedProfitMultiplier;

  return `${scaled / MULTIPLIER_SCALE}.${(scaled % MULTIPLIER_SCALE)
    .toString()
    .padStart(4, "0")}`;
}

function parseRate(value: string): bigint {
  const trimmed = value.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(trimmed);
  if (!match) {
    throw new Error("Daily USER net rate must be a valid percentage.");
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0"));
  const scaled = whole * RATE_SCALE + fraction;

  if (scaled <= 0n || scaled > 100n * RATE_SCALE) {
    throw new Error("Daily USER net rate must be greater than 0% and at most 100%.");
  }

  return scaled;
}
