import { Prisma } from '../generated/prisma/client';
import {
  derivePackageLifetimeTarget,
  grossTargetForUserNet,
  packageUserNetAmount,
  packageUserNetRateForDate,
} from './internal-trading-package-earnings';

describe('internal trading package USER net earning targets', () => {
  const randomTerms = {
    rewardRateMode: 'RANDOM_RANGE' as const,
    fixedRewardRate: null,
    minimumRewardRate: '0.400000',
    maximumRewardRate: '0.600000',
    rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
  };

  it('selects a deterministic USER net rate inside the package range', () => {
    const first = packageUserNetRateForDate(
      'subscription-1',
      '2026-09-07',
      randomTerms,
    );
    const second = packageUserNetRateForDate(
      'subscription-1',
      '2026-09-07',
      randomTerms,
    );

    expect(first.eq(second)).toBe(true);
    expect(first.gte(new Prisma.Decimal('0.400000'))).toBe(true);
    expect(first.lte(new Prisma.Decimal('0.600000'))).toBe(true);
  });

  it('calculates the actual USER daily credit from principal and net rate', () => {
    expect(packageUserNetAmount('25', '0.500000').toFixed(8)).toBe(
      '0.12500000',
    );
  });

  it('derives a gross split target that reproduces the USER net amount exactly', () => {
    const gross = grossTargetForUserNet('0.12500000', '70.000000');
    const userCredit = gross
      .mul('70.000000')
      .div(100)
      .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);

    expect(userCredit.toFixed(8)).toBe('0.12500000');
  });

  it('uses exactly duration earning days starting on the next local calendar day', () => {
    const target = derivePackageLifetimeTarget({
      subscriptionId: 'subscription-alpha',
      principalAmount: '5',
      userSharePercent: '70',
      activationLocalDate: '2026-09-06',
      earningDays: 10,
      ...randomTerms,
    });

    expect(target.firstEarningLocalDate).toBe('2026-09-07');
    expect(target.finalEarningLocalDate).toBe('2026-09-16');
    expect(target.userNetTarget.gt(0)).toBe(true);
    expect(target.grossTarget.gt(target.userNetTarget)).toBe(true);
    expect(target.grossMultiplier.gt(0)).toBe(true);
  });

  it('supports a fixed USER net daily rate without package-specific constants', () => {
    const rate = packageUserNetRateForDate('subscription-fixed', '2026-09-07', {
      rewardRateMode: 'FIXED',
      fixedRewardRate: '1.250000',
      minimumRewardRate: null,
      maximumRewardRate: null,
      rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
    });

    expect(rate.toFixed(6)).toBe('1.250000');
  });
});
