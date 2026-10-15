import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

/**
 * V2 INTERNAL simulation only — never evidence of an exchange execution.
 * Package rate is the daily signed NET GROSS rate, before USER/ADMIN split.
 * All rates use six-decimal percent units (not money), so the signed rates
 * sum exactly to the daily result before monetary rounding.
 */
const MICRO = 1_000_000n;
type DecimalValue = Prisma.Decimal | number | string;

export interface V2DailyRateTerms {
  rewardRateMode: 'FIXED' | 'RANDOM_RANGE' | 'MANUAL' | 'RULE_BASED';
  fixedRewardRate: DecimalValue | null;
  minimumRewardRate: DecimalValue | null;
  maximumRewardRate: DecimalValue | null;
}

export interface V2TradeSlot {
  slotNumber: number;
  outcome: 'WIN' | 'LOSS';
  resultPercent: string;
}

function pick(seed: string, maxExclusive: bigint): bigint {
  if (maxExclusive <= 0n) {
    throw new BadRequestException('Daily trading random span is invalid.');
  }
  const bytes = createHash('sha256').update(seed).digest();
  return bytes.readBigUInt64BE(0) % maxExclusive;
}

function micros(value: DecimalValue, field: string): bigint {
  const rate = new Prisma.Decimal(value);
  if (!rate.isFinite() || rate.lte(0) || rate.gt(100)) {
    throw new BadRequestException(`Invalid V2 ${field} percentage.`);
  }
  const scaled = rate.mul(MICRO.toString());
  if (!scaled.isInteger()) {
    throw new BadRequestException(`V2 ${field} exceeds six percent decimals.`);
  }
  return BigInt(scaled.toFixed(0));
}

function formatMicros(value: bigint): string {
  return new Prisma.Decimal(value.toString())
    .div(MICRO.toString())
    .toFixed(6);
}

export function v2DailyTradePlan(input: {
  subscriptionId: string;
  localTradeDate: string;
  terms: V2DailyRateTerms;
  activitiesPerDay: number;
}): { dailyGrossRatePercent: string; slots: V2TradeSlot[] } {
  if (input.activitiesPerDay !== 5) {
    throw new BadRequestException('V2 requires exactly five trades per day.');
  }
  const seed = `FTZ:INTERNAL_TRADING_V2:${input.subscriptionId}:${input.localTradeDate}`;
  let target: bigint;
  if (input.terms.rewardRateMode === 'FIXED') {
    if (input.terms.fixedRewardRate === null) {
      throw new BadRequestException('V2 fixed rate is missing.');
    }
    target = micros(input.terms.fixedRewardRate, 'fixedRewardRate');
  } else if (input.terms.rewardRateMode === 'RANDOM_RANGE') {
    if (
      input.terms.minimumRewardRate === null ||
      input.terms.maximumRewardRate === null
    ) {
      throw new BadRequestException('V2 rate range is missing.');
    }
    const min = micros(input.terms.minimumRewardRate, 'minimumRewardRate');
    const max = micros(input.terms.maximumRewardRate, 'maximumRewardRate');
    if (min > max) throw new BadRequestException('Invalid V2 rate range.');
    target = min + pick(`${seed}:daily-net`, max - min + 1n);
  } else {
    throw new BadRequestException(
      'V2 trading requires FIXED or RANDOM_RANGE package rates.',
    );
  }

  // No fixed 3:2 ratio. Keep one mandatory WIN and randomize the 0–4 LOSS slots.
  const lossCount = Number(pick(`${seed}:loss-count`, 5n));
  const outcomes: Array<'WIN' | 'LOSS'> = [
    ...Array.from({ length: lossCount }, () => 'LOSS' as const),
    ...Array.from({ length: 5 - lossCount }, () => 'WIN' as const),
  ];
  for (let i = 4; i > 0; i -= 1) {
    const j = Number(pick(`${seed}:outcome-swap:${i}`, BigInt(i + 1)));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  // A single WIN must be the fifth trade; 4 preceding LOSS trades.
  if (lossCount === 4) {
    outcomes.splice(0, outcomes.length, 'LOSS', 'LOSS', 'LOSS', 'LOSS', 'WIN');
  }

  const lossMagnitudes = outcomes.map((outcome, index) =>
    outcome === 'LOSS'
      ? 50_000n + pick(`${seed}:loss:${index}`, 250_001n)
      : 0n,
  );
  const totalLoss = lossMagnitudes.reduce((sum, amount) => sum + amount, 0n);
  const winIndices = outcomes
    .map((outcome, index) => (outcome === 'WIN' ? index : -1))
    .filter((index) => index >= 0);
  let remainingWin = target + totalLoss;
  const winRates = Array<bigint>(5).fill(0n);
  const weights = winIndices.map((index) =>
    1n + pick(`${seed}:win-weight:${index}`, 100n),
  );
  let remainingWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  winIndices.forEach((index, winIndex) => {
    const rate =
      winIndex === winIndices.length - 1
        ? remainingWin
        : (remainingWin * weights[winIndex]) / remainingWeight;
    if (rate <= 0n) {
      throw new BadRequestException('V2 WIN rate is not positive.');
    }
    winRates[index] = rate;
    remainingWin -= rate;
    remainingWeight -= weights[winIndex];
  });

  const slots: V2TradeSlot[] = outcomes.map((outcome, index) => ({
    slotNumber: index + 1,
    outcome,
    resultPercent: formatMicros(
      outcome === 'WIN' ? winRates[index] : -lossMagnitudes[index],
    ),
  }));
  const actual = slots.reduce(
    (sum, slot) =>
      sum + BigInt(new Prisma.Decimal(slot.resultPercent).mul(MICRO.toString()).toFixed(0)),
    0n,
  );
  if (actual !== target) {
    throw new BadRequestException('V2 daily signed trade rates do not balance.');
  }
  return { dailyGrossRatePercent: formatMicros(target), slots };
}
