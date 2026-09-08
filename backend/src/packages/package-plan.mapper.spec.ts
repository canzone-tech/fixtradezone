import { Prisma } from '../generated/prisma/client';
import { toItemSnapshot } from './package-plan.mapper';
import type { PlanItemWithDefinition } from './packages.types';

const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const DEFINITION_ID = '33333333-3333-4333-8333-333333333333';

function rangeItem(
  overrides: Partial<PlanItemWithDefinition> = {},
): PlanItemWithDefinition {
  const now = new Date('2026-09-07T00:00:00.000Z');

  return {
    id: ITEM_ID,
    planVersionId: PLAN_ID,
    packageDefinitionId: DEFINITION_ID,
    displayName: 'FTZ AlphaBot',
    slug: 'ftz-alphabot',
    sortOrder: 1,
    availability: 'AVAILABLE',
    price: new Prisma.Decimal('5.00000000'),
    minimumInvestment: new Prisma.Decimal('5.00000000'),
    maximumInvestment: new Prisma.Decimal('24.00000000'),
    durationDays: 10,
    currency: 'USDT',
    rewardRateMode: 'RANDOM_RANGE',
    fixedRewardRate: null,
    minimumRewardRate: new Prisma.Decimal('0.400000'),
    maximumRewardRate: new Prisma.Decimal('0.600000'),
    rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
    capBasis: 'TOTAL_RETURN',
    capMultiplier: new Prisma.Decimal('1.0600'),
    principalTreatment: 'RETURN_SEPARATELY',
    goalDays: 10,
    cycleDays: 10,
    rewardStartMode: 'NEXT_CALENDAR_DAY',
    rewardFrequency: 'DAILY_CALENDAR',
    cycleDayMode: 'CALENDAR_DAYS',
    rewardDayMode: 'EVERY_DAY',
    cycleEndAction: 'COMPLETE_PACKAGE',
    capReachedAction: 'COMPLETE_PACKAGE',
    createdAt: now,
    updatedAt: now,
    packageDefinition: {
      id: DEFINITION_ID,
      code: 'FTZ_ALPHABOT',
      createdAt: now,
    },
    ...overrides,
  };
}

describe('package plan mapper range snapshots', () => {
  it('reports bounded range maximums from USER-net rate and maximum investment', () => {
    const snapshot = toItemSnapshot(rangeItem());

    expect(snapshot.maximumProfit).toBe('1.44000000');
    expect(snapshot.maximumTotalReturn).toBe('25.44000000');
    expect(snapshot.principalReturn).toBe('RETURN_EXACT_INVESTED_PRINCIPAL');
  });

  it('does not invent a scalar maximum for an unbounded range', () => {
    const snapshot = toItemSnapshot(
      rangeItem({
        displayName: 'FTZ PrimeBot',
        slug: 'ftz-primebot',
        price: new Prisma.Decimal('5000.00000000'),
        minimumInvestment: new Prisma.Decimal('5000.00000000'),
        maximumInvestment: null,
        durationDays: 150,
        minimumRewardRate: new Prisma.Decimal('1.200000'),
        maximumRewardRate: new Prisma.Decimal('2.000000'),
        capMultiplier: new Prisma.Decimal('4.0000'),
        principalTreatment: 'NON_REFUNDABLE_PACKAGE_VALUE',
        goalDays: 150,
        cycleDays: 150,
        packageDefinition: {
          id: DEFINITION_ID,
          code: 'FTZ_PRIMEBOT',
          createdAt: new Date('2026-09-07T00:00:00.000Z'),
        },
      }),
    );

    expect(snapshot.maximumProfit).toBeNull();
    expect(snapshot.maximumTotalReturn).toBeNull();
    expect(snapshot.principalReturn).toBe('NO_CAPITAL_RETURN');
  });
});
