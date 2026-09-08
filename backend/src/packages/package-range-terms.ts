import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PackageRewardRateMode } from './packages.constants';

const RATE_DECIMAL_PLACES = 6;
const MULTIPLIER_DECIMAL_PLACES = 4;

export const RANGE_PACKAGE_TECHNICAL_TERMS = {
  currency: 'USDT',
  rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
  capBasis: 'TOTAL_RETURN',
  rewardStartMode: 'NEXT_CALENDAR_DAY',
  rewardFrequency: 'DAILY_CALENDAR',
  cycleDayMode: 'CALENDAR_DAYS',
  rewardDayMode: 'EVERY_DAY',
  cycleEndAction: 'COMPLETE_PACKAGE',
  capReachedAction: 'COMPLETE_PACKAGE',
} as const;

export interface RangeRateInput {
  rewardRateMode: PackageRewardRateMode;
  fixedRewardRate?: string | null;
  minimumRewardRate?: string | null;
  maximumRewardRate?: string | null;
  durationDays: number;
}

export function rangeCompatibilityCapMultiplier(input: RangeRateInput): string {
  if (!Number.isInteger(input.durationDays) || input.durationDays < 1) {
    throw new BadRequestException('durationDays must be at least 1.');
  }

  const upperRate = upperDailyUserNetRate(input);

  // capMultiplier remains a legacy compatibility snapshot only. New internal
  // trading financial authority is the package USER-net daily rate + duration.
  // The compatibility value is therefore derived, never client-authored.
  return new Prisma.Decimal(1)
    .add(upperRate.mul(input.durationDays).div(100))
    .toDecimalPlaces(MULTIPLIER_DECIMAL_PLACES, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(MULTIPLIER_DECIMAL_PLACES);
}

export function upperDailyUserNetRate(input: RangeRateInput): Prisma.Decimal {
  if (input.rewardRateMode === 'FIXED') {
    if (input.fixedRewardRate == null) {
      throw new BadRequestException(
        'FIXED range package requires fixedRewardRate.',
      );
    }

    return validRate(input.fixedRewardRate, 'fixedRewardRate');
  }

  if (input.rewardRateMode !== 'RANDOM_RANGE') {
    throw new BadRequestException(
      `Range package requires FIXED or RANDOM_RANGE rate mode, not ${input.rewardRateMode}.`,
    );
  }

  if (input.minimumRewardRate == null || input.maximumRewardRate == null) {
    throw new BadRequestException(
      'RANDOM_RANGE range package requires minimumRewardRate and maximumRewardRate.',
    );
  }

  const minimum = validRate(input.minimumRewardRate, 'minimumRewardRate');
  const maximum = validRate(input.maximumRewardRate, 'maximumRewardRate');

  if (minimum.gt(maximum)) {
    throw new BadRequestException(
      'minimumRewardRate cannot exceed maximumRewardRate.',
    );
  }

  return maximum;
}

function validRate(value: string, field: string): Prisma.Decimal {
  let parsed: Prisma.Decimal;

  try {
    parsed = new Prisma.Decimal(value).toDecimalPlaces(
      RATE_DECIMAL_PLACES,
      Prisma.Decimal.ROUND_HALF_UP,
    );
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal string.`);
  }

  if (!parsed.gt(0) || parsed.gt(100)) {
    throw new BadRequestException(
      `${field} must be greater than zero and no more than 100 percentage points.`,
    );
  }

  return parsed;
}
