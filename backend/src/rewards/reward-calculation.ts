import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  PACKAGE_REWARD_MONEY_DECIMAL_PLACES,
  PACKAGE_REWARD_RATE_DECIMAL_PLACES,
} from './rewards.constants';

type DecimalValue = Prisma.Decimal | number | string;

const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_SCALE = 10n ** BigInt(PACKAGE_REWARD_RATE_DECIMAL_PLACES);

export function moneyRoundDown(value: DecimalValue): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    PACKAGE_REWARD_MONEY_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_DOWN,
  );
}

export function moneyString(value: DecimalValue): string {
  return new Prisma.Decimal(value).toFixed(PACKAGE_REWARD_MONEY_DECIMAL_PLACES);
}

export function rateString(value: DecimalValue): string {
  return new Prisma.Decimal(value).toFixed(PACKAGE_REWARD_RATE_DECIMAL_PLACES);
}

export function deterministicRateInRange(
  sourceKey: string,
  minimumRate: DecimalValue,
  maximumRate: DecimalValue,
): Prisma.Decimal {
  const minimum = rateToScaledInteger(minimumRate);
  const maximum = rateToScaledInteger(maximumRate);
  if (minimum <= 0n || maximum < minimum) {
    throw new BadRequestException('Reward rate range is invalid.');
  }

  const span = maximum - minimum + 1n;
  const digest = createHash('sha256').update(sourceKey).digest();
  const sample = digest.readBigUInt64BE(0);
  const selected = minimum + (sample % span);

  return new Prisma.Decimal(selected.toString()).div(RATE_SCALE.toString());
}

export function localDateForInstant(date: Date, timeZone: string): string {
  const formatter = createDateFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const year = part(parts, 'year');
  const month = part(parts, 'month');
  const day = part(parts, 'day');
  return `${year}-${month}-${day}`;
}

export function addLocalDays(localDate: string, days: number): string {
  const { year, month, day } = parseLocalDate(localDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear().toString().padStart(4, '0'),
    (shifted.getUTCMonth() + 1).toString().padStart(2, '0'),
    shifted.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

export function localCalendarDayDifference(
  startLocalDate: string,
  endLocalDate: string,
): number {
  const start = localDateEpoch(startLocalDate);
  const end = localDateEpoch(endLocalDate);
  return Math.round((end - start) / DAY_MS);
}

export function localDateStartUtc(
  localDate: string,
  timeZone: string,
): Date {
  // Resolve local 00:00 through the IANA timezone using a small fixed-point
  // iteration. This handles non-integer offsets and DST without introducing a
  // second date/time library into the financial core.
  const { year, month, day } = parseLocalDate(localDate);
  const desiredAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = new Date(desiredAsUtc);
  const formatter = createDateTimeFormatter(timeZone);

  for (let attempt = 0; attempt < 4; attempt += 1) {
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

  const resolvedDate = localDateForInstant(guess, timeZone);
  const rendered = formatter.formatToParts(guess);
  if (
    resolvedDate !== localDate ||
    part(rendered, 'hour') !== '00' ||
    part(rendered, 'minute') !== '00'
  ) {
    throw new BadRequestException(
      `Unable to resolve local reward boundary for timezone ${timeZone}.`,
    );
  }
  return guess;
}

export function deriveRewardPosition(
  activationLocalDate: string,
  rewardLocalDate: string,
  cycleDays: number,
) {
  if (!Number.isInteger(cycleDays) || cycleDays <= 0) {
    throw new BadRequestException('cycleDays must be positive.');
  }
  const rewardDayNumber = localCalendarDayDifference(
    activationLocalDate,
    rewardLocalDate,
  );
  if (rewardDayNumber <= 0) {
    throw new BadRequestException(
      'Reward date must be after the activation local date.',
    );
  }

  return {
    rewardDayNumber,
    cycleNumber: Math.floor((rewardDayNumber - 1) / cycleDays) + 1,
    cycleDay: ((rewardDayNumber - 1) % cycleDays) + 1,
  };
}

function rateToScaledInteger(value: DecimalValue): bigint {
  const fixed = new Prisma.Decimal(value).toFixed(
    PACKAGE_REWARD_RATE_DECIMAL_PLACES,
  );
  return BigInt(fixed.replace('.', ''));
}

function createDateFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new BadRequestException(
      `Invalid subscription settlement timezone: ${timeZone}.`,
    );
  }
}

function createDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
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
      `Invalid subscription settlement timezone: ${timeZone}.`,
    );
  }
}

function parseLocalDate(localDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new BadRequestException('Reward local date must be YYYY-MM-DD.');
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
    throw new BadRequestException('Reward local date is invalid.');
  }
  return { year, month, day };
}

function localDateEpoch(localDate: string): number {
  const { year, month, day } = parseLocalDate(localDate);
  return Date.UTC(year, month - 1, day);
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((candidate) => candidate.type === type)?.value;
  if (!value) {
    throw new BadRequestException(`Unable to resolve timezone date part ${type}.`);
  }
  return value;
}
