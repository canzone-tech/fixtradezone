import 'reflect-metadata';
import { Prisma } from '../generated/prisma/client';
import {
  addLocalDays,
  deriveRewardPosition,
  deterministicRateInRange,
  localCalendarDayDifference,
  localDateForInstant,
  localDateStartUtc,
  moneyRoundDown,
} from './reward-calculation';

describe('RWD-01 reward calculation helpers', () => {
  it('selects a deterministic six-decimal rate inside the configured range', () => {
    const first = deterministicRateInRange(
      'SUBSCRIPTION:abc:PACKAGE_REWARD:2026-08-29',
      '0.400000',
      '0.600000',
    );
    const second = deterministicRateInRange(
      'SUBSCRIPTION:abc:PACKAGE_REWARD:2026-08-29',
      '0.400000',
      '0.600000',
    );

    expect(first.toFixed(6)).toBe(second.toFixed(6));
    expect(first.gte(new Prisma.Decimal('0.400000'))).toBe(true);
    expect(first.lte(new Prisma.Decimal('0.600000'))).toBe(true);
  });

  it('rounds money down to eight decimals so a reward never over-credits', () => {
    expect(moneyRoundDown('1.123456789').toFixed(8)).toBe('1.12345678');
  });

  it('preserves natural package day/cycle numbering under forward-only rollout', () => {
    const position = deriveRewardPosition('2026-08-20', '2026-08-29', 10);
    expect(position).toEqual({
      rewardDayNumber: 9,
      cycleNumber: 1,
      cycleDay: 9,
    });

    expect(deriveRewardPosition('2026-08-20', '2026-08-31', 10)).toEqual({
      rewardDayNumber: 11,
      cycleNumber: 2,
      cycleDay: 1,
    });
  });

  it('does calendar arithmetic without resetting package lifetime', () => {
    expect(addLocalDays('2026-08-28', 1)).toBe('2026-08-29');
    expect(localCalendarDayDifference('2026-08-20', '2026-08-29')).toBe(9);
  });

  it('resolves UTC and non-integer timezone local midnight boundaries', () => {
    expect(localDateStartUtc('2026-08-29', 'UTC').toISOString()).toBe(
      '2026-08-29T00:00:00.000Z',
    );
    expect(localDateStartUtc('2026-08-29', 'Asia/Kolkata').toISOString()).toBe(
      '2026-08-28T18:30:00.000Z',
    );
    expect(
      localDateForInstant(new Date('2026-08-28T18:30:00.000Z'), 'Asia/Kolkata'),
    ).toBe('2026-08-29');
  });
});
