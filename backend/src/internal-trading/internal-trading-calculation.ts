import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const PERCENT_DECIMAL_PLACES = 6;
const PERCENT_SCALE = 10n ** BigInt(PERCENT_DECIMAL_PLACES);
const MONEY_DECIMAL_PLACES = 8;
const MONEY_QUANTUM = new Prisma.Decimal('0.00000001');

type DecimalValue = Prisma.Decimal | number | string;

export type InternalTradeOutcome = 'WIN' | 'LOSS';

export type InternalTradeEventType = 'NORMAL' | 'TARGET_RECONCILIATION';

export interface InternalTradeTimingWindow {
  start: string;
  end: string;
}

export interface DeterministicInternalTradeSlot {
  scheduledAt: Date;
  assetSymbol: string;
  outcome: InternalTradeOutcome;
  resultPercent: string;
}

export interface InternalTradeFinancialSnapshot {
  grossTarget: DecimalValue;
  grossProgressBefore: DecimalValue;
  grossHighWaterBefore: DecimalValue;
  userSharePercent: DecimalValue;
  adminSharePercent: DecimalValue;
  userCreditedBefore: DecimalValue;
  adminRecognizedBefore: DecimalValue;
}

export interface InternalTradeTransition {
  eventType: InternalTradeEventType;

  grossResultAmount: string;
  grossProgressBefore: string;
  grossProgressAfter: string;

  grossHighWaterBefore: string;
  grossHighWaterAfter: string;

  grossSettlementAmount: string;

  userSettlementAmount: string;
  adminSettlementAmount: string;

  userCreditedAfter: string;
  adminRecognizedAfter: string;

  reachedGrossTarget: boolean;
}

export function deterministicInternalTradeSlot(input: {
  sourceKey: string;
  localTradeDate: string;
  slotNumber: number;
  activitiesPerDay: number;

  assetSymbols: string[];

  winWeight: number;
  lossWeight: number;

  winMinimumPercent: DecimalValue;
  winMaximumPercent: DecimalValue;

  lossMinimumPercent: DecimalValue;
  lossMaximumPercent: DecimalValue;

  timingWindows: InternalTradeTimingWindow[];
  timezoneSnapshot: string;
}): DeterministicInternalTradeSlot {
  validateSlot(input.slotNumber, input.activitiesPerDay);

  if (input.assetSymbols.length === 0) {
    throw new BadRequestException(
      'At least one internal trading asset is required.',
    );
  }

  if (
    !Number.isInteger(input.winWeight) ||
    !Number.isInteger(input.lossWeight) ||
    input.winWeight < 0 ||
    input.lossWeight < 0
  ) {
    throw new BadRequestException(
      'Internal trading outcome weights are invalid.',
    );
  }

  const totalWeight = input.winWeight + input.lossWeight;

  if (totalWeight <= 0) {
    throw new BadRequestException(
      'Internal trading outcome weights must total above zero.',
    );
  }

  const assetIndex = deterministicIndex(
    `${input.sourceKey}:asset`,
    input.assetSymbols.length,
  );

  const outcome = deterministicDailyOutcome({
    sourceKey: input.sourceKey,
    slotNumber: input.slotNumber,
    activitiesPerDay: input.activitiesPerDay,
    winWeight: input.winWeight,
    lossWeight: input.lossWeight,
  });

  const magnitude = deterministicPercent(
    `${input.sourceKey}:result`,
    outcome === 'WIN' ? input.winMinimumPercent : input.lossMinimumPercent,
    outcome === 'WIN' ? input.winMaximumPercent : input.lossMaximumPercent,
  );

  return {
    scheduledAt: deterministicScheduledAt({
      sourceKey: input.sourceKey,
      localTradeDate: input.localTradeDate,
      slotNumber: input.slotNumber,
      activitiesPerDay: input.activitiesPerDay,
      timingWindows: input.timingWindows,
      timezoneSnapshot: input.timezoneSnapshot,
    }),

    assetSymbol: input.assetSymbols[assetIndex],

    outcome,

    resultPercent:
      outcome === 'WIN'
        ? magnitude.toFixed(PERCENT_DECIMAL_PLACES)
        : magnitude.negated().toFixed(PERCENT_DECIMAL_PLACES),
  };
}

/**
 * NORMAL trades are never allowed to complete the package.
 *
 * grossTarget - 0.00000001 is the maximum NORMAL progress.
 * The final exact target is closed only by TARGET_RECONCILIATION.
 *
 * LOSS may move package gross progress below zero while settled high-water
 * a negative financial balance.
 */
export function calculateNormalTradeTransition(
  snapshot: InternalTradeFinancialSnapshot,
  requestedGrossResultAmount: DecimalValue,
): InternalTradeTransition {
  const state = normalizeFinancialSnapshot(snapshot);

  const requested = money(requestedGrossResultAmount);

  if (requested.eq(0)) {
    throw new BadRequestException(
      'Normal internal trade result cannot be zero.',
    );
  }

  let progressAfter = state.grossProgressBefore.add(requested);
  const normalCeiling = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    state.grossTarget.sub(MONEY_QUANTUM),
  );

  if (progressAfter.gt(normalCeiling)) {
    progressAfter = normalCeiling;
  }

  progressAfter = money(progressAfter);

  const appliedGrossResult = money(
    progressAfter.sub(state.grossProgressBefore),
  );

  const highWaterAfter = money(
    Prisma.Decimal.max(state.grossHighWaterBefore, progressAfter),
  );

  return buildTransition({
    eventType: 'NORMAL',
    state,
    grossResultAmount: appliedGrossResult,
    grossProgressAfter: progressAfter,
    grossHighWaterAfter: highWaterAfter,
    reachedGrossTarget: false,
  });
}

/**
 * Duration-end safety closure.
 *
 * This does not rewrite historical WIN/LOSS events.
 * It creates one explicit TARGET_RECONCILIATION WIN whose applied
 * gross result closes gross progress to grossTarget exactly.
 */
export function calculateTargetReconciliationTransition(
  snapshot: InternalTradeFinancialSnapshot,
): InternalTradeTransition {
  const state = normalizeFinancialSnapshot(snapshot);

  if (state.grossProgressBefore.gte(state.grossTarget)) {
    throw new BadRequestException(
      'Target reconciliation requires remaining gross target.',
    );
  }

  const appliedGrossResult = money(
    state.grossTarget.sub(state.grossProgressBefore),
  );

  return buildTransition({
    eventType: 'TARGET_RECONCILIATION',
    state,
    grossResultAmount: appliedGrossResult,
    grossProgressAfter: state.grossTarget,
    grossHighWaterAfter: state.grossTarget,
    reachedGrossTarget: true,
  });
}

function deterministicDailyOutcome(input: {
  sourceKey: string;
  slotNumber: number;
  activitiesPerDay: number;
  winWeight: number;
  lossWeight: number;
}): InternalTradeOutcome {
  const totalWeight = input.winWeight + input.lossWeight;

  if (input.winWeight === 0) {
    return 'LOSS';
  }

  if (input.lossWeight === 0) {
    return 'WIN';
  }

  const winCount = Math.max(
    0,
    Math.min(
      input.activitiesPerDay,
      Math.round((input.activitiesPerDay * input.winWeight) / totalWeight),
    ),
  );

  const outcomes: InternalTradeOutcome[] = [
    ...Array.from({ length: winCount }, () => 'WIN' as const),
    ...Array.from(
      { length: input.activitiesPerDay - winCount },
      () => 'LOSS' as const,
    ),
  ];

  const dailySeed = input.sourceKey.replace(/:SLOT:\d+(?::.*)?$/, '');

  for (let index = outcomes.length - 1; index > 0; index -= 1) {
    const swapIndex = deterministicIndex(
      `${dailySeed}:OUTCOME_ORDER:${index}`,
      index + 1,
    );

    [outcomes[index], outcomes[swapIndex]] = [
      outcomes[swapIndex],
      outcomes[index],
    ];
  }

  return outcomes[input.slotNumber - 1];
}

export function deterministicScheduledAt(input: {
  sourceKey: string;
  localTradeDate: string;
  slotNumber: number;
  activitiesPerDay: number;
  timingWindows: InternalTradeTimingWindow[];
  timezoneSnapshot: string;
}): Date {
  validateSlot(input.slotNumber, input.activitiesPerDay);

  const windows = input.timingWindows.map((window) => ({
    start: clockMinute(window.start),
    end: clockMinute(window.end),
  }));

  if (windows.length === 0) {
    throw new BadRequestException(
      'At least one internal trading timing window is required.',
    );
  }

  let previousEnd = -1;
  let totalMinutes = 0;

  for (const window of windows) {
    if (window.end <= window.start) {
      throw new BadRequestException(
        'Internal trading timing window must end after it starts.',
      );
    }

    if (window.start < previousEnd) {
      throw new BadRequestException(
        'Internal trading timing windows cannot overlap or be out of order.',
      );
    }

    previousEnd = window.end;
    totalMinutes += window.end - window.start;
  }

  if (totalMinutes < input.activitiesPerDay) {
    throw new BadRequestException(
      'Internal trading timing windows are too small for the configured daily trade count.',
    );
  }

  const segmentStart = Math.floor(
    (totalMinutes * (input.slotNumber - 1)) / input.activitiesPerDay,
  );

  const segmentEnd = Math.floor(
    (totalMinutes * input.slotNumber) / input.activitiesPerDay,
  );

  const segmentSpan = Math.max(1, segmentEnd - segmentStart);

  const linearMinute =
    segmentStart + deterministicIndex(`${input.sourceKey}:time`, segmentSpan);

  let remaining = linearMinute;
  let localMinute: number | null = null;

  for (const window of windows) {
    const duration = window.end - window.start;

    if (remaining < duration) {
      localMinute = window.start + remaining;
      break;
    }

    remaining -= duration;
  }

  if (localMinute === null) {
    throw new BadRequestException('Unable to resolve internal trade schedule.');
  }

  return localDateTimeUtc(
    input.localTradeDate,
    Math.floor(localMinute / 60),
    localMinute % 60,
    input.timezoneSnapshot,
  );
}

function buildTransition(input: {
  eventType: InternalTradeEventType;
  state: ReturnType<typeof normalizeFinancialSnapshot>;
  grossResultAmount: Prisma.Decimal;
  grossProgressAfter: Prisma.Decimal;
  grossHighWaterAfter: Prisma.Decimal;
  reachedGrossTarget: boolean;
}): InternalTradeTransition {
  const settledGrossBefore = money(
    input.state.userCreditedBefore.add(input.state.adminRecognizedBefore),
  );

  const remainingSettlementCapacity = money(
    Prisma.Decimal.max(
      new Prisma.Decimal(0),
      input.state.grossTarget.sub(settledGrossBefore),
    ),
  );

  const positiveGrossResult = money(
    Prisma.Decimal.max(new Prisma.Decimal(0), input.grossResultAmount),
  );

  const grossSettlementAmount = money(
    Prisma.Decimal.min(positiveGrossResult, remainingSettlementCapacity),
  );

  const settledGrossAfter = money(
    settledGrossBefore.add(grossSettlementAmount),
  );

  const desiredUserCreditedTotal = percentageMoney(
    settledGrossAfter,
    input.state.userSharePercent,
  );

  const desiredAdminRecognizedTotal = money(
    settledGrossAfter.sub(desiredUserCreditedTotal),
  );

  const userSettlementAmount = money(
    desiredUserCreditedTotal.sub(input.state.userCreditedBefore),
  );

  const adminSettlementAmount = money(
    desiredAdminRecognizedTotal.sub(input.state.adminRecognizedBefore),
  );

  if (userSettlementAmount.lt(0) || adminSettlementAmount.lt(0)) {
    throw new BadRequestException(
      'Internal trading settlement cannot reverse prior wallet earnings.',
    );
  }

  if (
    !money(userSettlementAmount.add(adminSettlementAmount)).eq(
      grossSettlementAmount,
    )
  ) {
    throw new BadRequestException(
      'Internal trading USER/ADMIN settlement does not balance.',
    );
  }

  return {
    eventType: input.eventType,

    grossResultAmount: moneyString(input.grossResultAmount),

    grossProgressBefore: moneyString(input.state.grossProgressBefore),

    grossProgressAfter: moneyString(input.grossProgressAfter),

    grossHighWaterBefore: moneyString(input.state.grossHighWaterBefore),

    grossHighWaterAfter: moneyString(input.grossHighWaterAfter),

    grossSettlementAmount: moneyString(grossSettlementAmount),

    userSettlementAmount: moneyString(userSettlementAmount),

    adminSettlementAmount: moneyString(adminSettlementAmount),

    userCreditedAfter: moneyString(desiredUserCreditedTotal),

    adminRecognizedAfter: moneyString(desiredAdminRecognizedTotal),

    reachedGrossTarget: input.reachedGrossTarget,
  };
}

function normalizeFinancialSnapshot(snapshot: InternalTradeFinancialSnapshot) {
  const grossTarget = money(snapshot.grossTarget);

  const grossProgressBefore = money(snapshot.grossProgressBefore);

  const grossHighWaterBefore = money(snapshot.grossHighWaterBefore);

  const userSharePercent = rate(snapshot.userSharePercent);

  const adminSharePercent = rate(snapshot.adminSharePercent);

  const userCreditedBefore = money(snapshot.userCreditedBefore);

  const adminRecognizedBefore = money(snapshot.adminRecognizedBefore);

  if (grossTarget.lte(0)) {
    throw new BadRequestException(
      'Internal trading gross target must be positive.',
    );
  }

  if (grossProgressBefore.gt(grossTarget)) {
    throw new BadRequestException(
      'Internal trading gross progress is invalid.',
    );
  }

  if (
    grossHighWaterBefore.lt(0) ||
    grossHighWaterBefore.gt(grossTarget) ||
    grossHighWaterBefore.lt(grossProgressBefore)
  ) {
    throw new BadRequestException(
      'Internal trading gross high-water state is invalid.',
    );
  }

  if (
    userSharePercent.lt(0) ||
    adminSharePercent.lt(0) ||
    !userSharePercent.add(adminSharePercent).eq(new Prisma.Decimal(100))
  ) {
    throw new BadRequestException(
      'Internal trading USER/ADMIN split must total 100%.',
    );
  }

  if (userCreditedBefore.lt(0) || adminRecognizedBefore.lt(0)) {
    throw new BadRequestException(
      'Internal trading financial credits cannot be negative.',
    );
  }

  const settledGrossBefore = money(
    userCreditedBefore.add(adminRecognizedBefore),
  );

  if (settledGrossBefore.gt(grossTarget)) {
    throw new BadRequestException(
      'Internal trading settled gross cannot exceed the package gross target.',
    );
  }

  return {
    grossTarget,
    grossProgressBefore,
    grossHighWaterBefore,
    userSharePercent,
    adminSharePercent,
    userCreditedBefore,
    adminRecognizedBefore,
  };
}

function percentageMoney(
  grossAmount: Prisma.Decimal,
  percent: Prisma.Decimal,
): Prisma.Decimal {
  return money(grossAmount.mul(percent).div(100));
}

function money(value: DecimalValue): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(MONEY_DECIMAL_PLACES, 4);
}

function rate(value: DecimalValue): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(PERCENT_DECIMAL_PLACES, 4);
}

function moneyString(value: DecimalValue): string {
  return money(value).toFixed(MONEY_DECIMAL_PLACES);
}

function validateSlot(slotNumber: number, activitiesPerDay: number): void {
  if (
    !Number.isInteger(activitiesPerDay) ||
    activitiesPerDay <= 0 ||
    !Number.isInteger(slotNumber) ||
    slotNumber < 1 ||
    slotNumber > activitiesPerDay
  ) {
    throw new BadRequestException('Internal trading slot is invalid.');
  }
}

function deterministicPercent(
  seed: string,
  minimum: DecimalValue,
  maximum: DecimalValue,
): Prisma.Decimal {
  const minimumScaled = percentScaled(minimum);

  const maximumScaled = percentScaled(maximum);

  if (minimumScaled <= 0n || maximumScaled < minimumScaled) {
    throw new BadRequestException(
      'Internal trading percentage range is invalid.',
    );
  }

  const span = maximumScaled - minimumScaled + 1n;

  const selected = minimumScaled + (sample64(seed) % span);

  return new Prisma.Decimal(selected.toString()).div(PERCENT_SCALE.toString());
}

function deterministicIndex(seed: string, size: number): number {
  if (!Number.isInteger(size) || size <= 0) {
    throw new BadRequestException(
      'Internal trading deterministic selection is invalid.',
    );
  }

  return Number(sample64(seed) % BigInt(size));
}

function sample64(seed: string): bigint {
  return createHash('sha256').update(seed).digest().readBigUInt64BE(0);
}

function percentScaled(value: DecimalValue): bigint {
  const fixed = new Prisma.Decimal(value).toFixed(PERCENT_DECIMAL_PLACES);

  return BigInt(fixed.replace('.', ''));
}

function clockMinute(value: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);

  if (!match) {
    throw new BadRequestException(
      'Internal trading timing values must use HH:MM.',
    );
  }

  const [hour, minute] = value.split(':').map(Number);

  return hour * 60 + minute;
}

function localDateTimeUtc(
  localDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const parsed = parseLocalDate(localDate);

  const desiredAsUtc = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    hour,
    minute,
    0,
    0,
  );

  let guess = new Date(desiredAsUtc);

  const formatter = dateTimeFormatter(timeZone);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = formatter.formatToParts(guess);

    const renderedAsUtc = Date.UTC(
      Number(part(parts, 'year')),
      Number(part(parts, 'month')) - 1,
      Number(part(parts, 'day')),
      Number(part(parts, 'hour')),
      Number(part(parts, 'minute')),
      Number(part(parts, 'second')),
      0,
    );

    const delta = desiredAsUtc - renderedAsUtc;

    if (delta === 0) {
      return guess;
    }

    guess = new Date(guess.getTime() + delta);
  }

  const parts = formatter.formatToParts(guess);

  if (
    part(parts, 'year') !== String(parsed.year).padStart(4, '0') ||
    part(parts, 'month') !== String(parsed.month).padStart(2, '0') ||
    part(parts, 'day') !== String(parsed.day).padStart(2, '0') ||
    part(parts, 'hour') !== String(hour).padStart(2, '0') ||
    part(parts, 'minute') !== String(minute).padStart(2, '0')
  ) {
    throw new BadRequestException(
      `Unable to resolve internal trade time in timezone ${timeZone}.`,
    );
  }

  return guess;
}

function parseLocalDate(localDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match) {
    throw new BadRequestException(
      'Internal trading local date must use YYYY-MM-DD.',
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException('Internal trading local date is invalid.');
  }

  return {
    year,
    month,
    day,
  };
}

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new BadRequestException(
      `Invalid internal trading timezone: ${timeZone}.`,
    );
  }
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((candidate) => candidate.type === type)?.value;

  if (!value) {
    throw new BadRequestException(
      `Unable to resolve internal trading timezone part ${type}.`,
    );
  }

  return value;
}
