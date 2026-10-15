import { Prisma } from '../generated/prisma/client';
import { v2DailyTradePlan } from './internal-trading-v2-plan';

const terms = {
  rewardRateMode: 'RANDOM_RANGE' as const,
  fixedRewardRate: null,
  minimumRewardRate: '0.700000',
  maximumRewardRate: '0.900000',
};

describe('V2 generated daily trading (five signed trades)', () => {
  it('varies per subscription and day while staying in package gross rate bounds', () => {
    const rates = new Set<string>();
    for (let day = 1; day <= 25; day += 1) {
      const date = `2026-10-${String(day).padStart(2, '0')}`;
      for (const subscriptionId of ['a', 'b', 'c']) {
        const plan = v2DailyTradePlan({
          subscriptionId, localTradeDate: date,
          terms, activitiesPerDay: 5,
        });
        rates.add(plan.dailyGrossRatePercent);
        expect(Number(plan.dailyGrossRatePercent)).toBeGreaterThanOrEqual(0.7);
        expect(Number(plan.dailyGrossRatePercent)).toBeLessThanOrEqual(0.9);
        expect(plan.slots).toHaveLength(5);
        expect(plan.slots.map((slot) => slot.slotNumber)).toEqual([1, 2, 3, 4, 5]);
        expect(plan.slots.some((slot) => slot.outcome === 'WIN')).toBe(true);
        for (const slot of plan.slots) {
          expect(new Prisma.Decimal(slot.resultPercent).gt(0)).toBe(slot.outcome === 'WIN');
        }
        const signed = plan.slots.reduce(
          (sum, slot) => sum.add(slot.resultPercent),
          new Prisma.Decimal(0),
        );
        expect(signed.toFixed(6)).toBe(plan.dailyGrossRatePercent);
        if (plan.slots.filter((slot) => slot.outcome === 'WIN').length === 1) {
          expect(plan.slots[4].outcome).toBe('WIN');
        }
      }
    }
    expect(rates.size).toBeGreaterThan(5);
  });

  it('is replay deterministic', () => {
    const input = { subscriptionId: 'sample', localTradeDate: '2026-10-15', terms, activitiesPerDay: 5 };
    expect(v2DailyTradePlan(input)).toEqual(v2DailyTradePlan(input));
  });

  it('enforces exactly five slots', () => {
    expect(() => v2DailyTradePlan({
      subscriptionId: 'sample', localTradeDate: '2026-10-15',
      terms, activitiesPerDay: 4,
    })).toThrow();
  });
});
