import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  SIMULATED_ACTIVITY_PERCENT_DECIMAL_PLACES,
  type SimulatedActivityOutcome,
  type SimulatedTimingWindow,
} from './simulated-activity.constants';

type DecimalValue = Prisma.Decimal | number | string;
const PERCENT_SCALE = 10n ** BigInt(SIMULATED_ACTIVITY_PERCENT_DECIMAL_PLACES);

export interface SimulatedSlotDefinition {
  scheduledAt: Date;
  assetSymbol: string;
  outcome: SimulatedActivityOutcome;
  resultPercent: string;
}

export function localDateForInstant(date: Date, timeZone: string): string {
  const parts = dateFormatter(timeZone).formatToParts(date);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}

export function addLocalDays(localDate: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new BadRequestException('Local day offset must be an integer.');
  }
  const { year, month, day } = parseLocalDate(localDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear().toString().padStart(4, '0'),
    (shifted.getUTCMonth() + 1).toString().padStart(2, '0'),
    shifted.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

export function localDateStartUtc(localDate: string, timeZone: string): Date {
  return localDateTimeUtc(localDate, 0, 0, timeZone);
}

export function nextLocalDateStartUtc(date: Date, timeZone: string): Date {
  const localDate = localDateForInstant(date, timeZone);
  return localDateStartUtc(addLocalDays(localDate, 1), timeZone);
}

export function isLocalDateStartInstant(date: Date, timeZone: string): boolean {
  const localDate = localDateForInstant(date, timeZone);
  return localDateStartUtc(localDate, timeZone).getTime() === date.getTime();
}

export function localDateStartAtOrAfterUtc(date: Date, timeZone: string): Date {
  return isLocalDateStartInstant(date, timeZone)
    ? new Date(date.getTime())
    : nextLocalDateStartUtc(date, timeZone);
}

export function deterministicSimulatedSlot(input: {
  sourceKey: string;
  localActivityDate: string;
  slotNumber: number;
  activitiesPerDay: number;
  assetSymbols: string[];
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: DecimalValue;
  winMaximumPercent: DecimalValue;
  lossMinimumPercent: DecimalValue;
  lossMaximumPercent: DecimalValue;
  timingWindows: SimulatedTimingWindow[];
  timezoneSnapshot: string;
}): SimulatedSlotDefinition {
  if (
    !Number.isInteger(input.slotNumber) ||
    input.slotNumber < 1 ||
    input.slotNumber > input.activitiesPerDay
  ) {
    throw new BadRequestException('Simulated activity slot is invalid.');
  }
  if (input.assetSymbols.length === 0) {
    throw new BadRequestException('At least one simulated asset is required.');
  }
  if (input.winWeight < 0 || input.lossWeight < 0) {
    throw new BadRequestException(
      'Simulated outcome weights cannot be negative.',
    );
  }
  const totalWeight = input.winWeight + input.lossWeight;
  if (!Number.isInteger(totalWeight) || totalWeight <= 0) {
    throw new BadRequestException('Simulated outcome weights are invalid.');
  }

  const assetIndex = deterministicIndex(
    `${input.sourceKey}:asset`,
    input.assetSymbols.length,
  );
  const outcomePick = deterministicIndex(
    `${input.sourceKey}:outcome`,
    totalWeight,
  );
  const outcome: SimulatedActivityOutcome =
    outcomePick < input.winWeight ? 'WIN' : 'LOSS';
  const magnitude = deterministicPercent(
    `${input.sourceKey}:result`,
    outcome === 'WIN' ? input.winMinimumPercent : input.lossMinimumPercent,
    outcome === 'WIN' ? input.winMaximumPercent : input.lossMaximumPercent,
  );

  return {
    scheduledAt: deterministicScheduledAt({
      sourceKey: input.sourceKey,
      localActivityDate: input.localActivityDate,
      slotNumber: input.slotNumber,
      activitiesPerDay: input.activitiesPerDay,
      timingWindows: input.timingWindows,
      timezoneSnapshot: input.timezoneSnapshot,
    }),
    assetSymbol: input.assetSymbols[assetIndex],
    outcome,
    resultPercent:
      outcome === 'WIN'
        ? magnitude.toFixed(SIMULATED_ACTIVITY_PERCENT_DECIMAL_PLACES)
        : magnitude
            .negated()
            .toFixed(SIMULATED_ACTIVITY_PERCENT_DECIMAL_PLACES),
  };
}

export function deterministicScheduledAt(input: {
  sourceKey: string;
  localActivityDate: string;
  slotNumber: number;
  activitiesPerDay: number;
  timingWindows: SimulatedTimingWindow[];
  timezoneSnapshot: string;
}): Date {
  const windows = input.timingWindows.map((window) => ({
    start: clockMinute(window.start),
    end: clockMinute(window.end),
  }));
  if (windows.length === 0) {
    throw new BadRequestException(
      'At least one simulated timing window is required.',
    );
  }

  let previousEnd = -1;
  let totalMinutes = 0;
  for (const window of windows) {
    if (window.end <= window.start) {
      throw new BadRequestException(
        'Simulated timing windows must end after they start on the same local day.',
      );
    }
    if (window.start < previousEnd) {
      throw new BadRequestException(
        'Simulated timing windows cannot overlap or be out of order.',
      );
    }
    previousEnd = window.end;
    totalMinutes += window.end - window.start;
  }

  if (
    !Number.isInteger(input.activitiesPerDay) ||
    input.activitiesPerDay <= 0 ||
    totalMinutes < input.activitiesPerDay
  ) {
    throw new BadRequestException(
      'Simulated timing windows are too small for the configured daily activity count.',
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
    throw new BadRequestException('Unable to resolve simulated activity time.');
  }

  return localDateTimeUtc(
    input.localActivityDate,
    Math.floor(localMinute / 60),
    localMinute % 60,
    input.timezoneSnapshot,
  );
}

export function validateTimingWindows(
  timingWindows: SimulatedTimingWindow[],
  activitiesPerDay: number,
): void {
  deterministicScheduledAt({
    sourceKey: 'SIMULATED_ACTIVITY:VALIDATION',
    localActivityDate: '2026-01-15',
    slotNumber: 1,
    activitiesPerDay,
    timingWindows,
    timezoneSnapshot: 'UTC',
  });
}

export function validateIanaTimezone(timeZone: string): void {
  dateFormatter(timeZone);
}

function deterministicPercent(
  seed: string,
  minimum: DecimalValue,
  maximum: DecimalValue,
): Prisma.Decimal {
  const minimumScaled = percentScaled(minimum);
  const maximumScaled = percentScaled(maximum);
  if (minimumScaled <= 0n || maximumScaled < minimumScaled) {
    throw new BadRequestException('Simulated percentage range is invalid.');
  }
  const span = maximumScaled - minimumScaled + 1n;
  const selected = minimumScaled + (sample64(seed) % span);
  return new Prisma.Decimal(selected.toString()).div(PERCENT_SCALE.toString());
}

function deterministicIndex(seed: string, size: number): number {
  if (!Number.isInteger(size) || size <= 0) {
    throw new BadRequestException(
      'Deterministic simulation selection is invalid.',
    );
  }
  return Number(sample64(seed) % BigInt(size));
}

function sample64(seed: string): bigint {
  return createHash('sha256').update(seed).digest().readBigUInt64BE(0);
}

function percentScaled(value: DecimalValue): bigint {
  const fixed = new Prisma.Decimal(value).toFixed(
    SIMULATED_ACTIVITY_PERCENT_DECIMAL_PLACES,
  );
  return BigInt(fixed.replace('.', ''));
}

function clockMinute(value: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) {
    throw new BadRequestException('Simulated timing values must use HH:MM.');
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
    if (delta === 0) return guess;
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
      `Unable to resolve simulated activity time in timezone ${timeZone}.`,
    );
  }
  return guess;
}

function parseLocalDate(localDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new BadRequestException('Simulated local date must be YYYY-MM-DD.');
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
    throw new BadRequestException('Simulated local date is invalid.');
  }
  return { year, month, day };
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new BadRequestException(
      `Invalid simulated activity timezone: ${timeZone}.`,
    );
  }
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
      `Invalid simulated activity timezone: ${timeZone}.`,
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
      `Unable to resolve simulated timezone part ${type}.`,
    );
  }
  return value;
}
