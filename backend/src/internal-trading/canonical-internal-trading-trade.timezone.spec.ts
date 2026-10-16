import { PrismaService } from '../database/prisma.service';
import { CanonicalInternalTradingTradeService } from './canonical-internal-trading-trade.service';
import { InternalTradingV2TradeService } from './internal-trading-v2-trade.service';

describe('Canonical V1 historical timezone snapshots', () => {
  const reconciler = new CanonicalInternalTradingTradeService(
    {} as PrismaService,
    {} as InternalTradingV2TradeService,
  );
  const check = (
    event: unknown,
    state: unknown,
    localTradeDate = '2026-09-21',
  ) =>
    (
      reconciler as unknown as {
        assertCanonicalEventMatchesState(
          event: unknown,
          state: unknown,
          localTradeDate: string,
        ): void;
      }
    ).assertCanonicalEventMatchesState(event, state, localTradeDate);

  const state = {
    subscriptionId: 'subscription-1',
    userId: 'user-1',
    packagePlanVersionId: 'plan-1',
    packagePlanItemId: 'item-1',
    packageCode: 'FTZ-PLAN',
    timezoneSnapshot: 'UTC',
    financialModelVersion: 'V1' as const,
  };

  const event = {
    subscriptionId: 'subscription-1',
    userId: 'user-1',
    packagePlanVersionId: 'plan-1',
    packagePlanItemId: 'item-1',
    packageCode: 'FTZ-PLAN',
    localActivityDate: '2026-09-21',
    // 01:30 on 21 Sep in Asia/Kolkata is 20 Sep in UTC.
    scheduledAt: new Date('2026-09-20T20:00:00.000Z'),
    timezoneSnapshot: 'Asia/Kolkata',
    policyTimezoneSnapshot: 'Asia/Kolkata',
  };

  it('accepts V1 UTC state with historical Asia/Kolkata canonical policy day', () => {
    expect(() => check(event, state)).not.toThrow();
  });

  it('preserves exact package identity checks', () => {
    expect(() =>
      check({ ...event, packagePlanItemId: 'another-item' }, state),
    ).toThrow('Canonical Daily Trade snapshot');
  });

  it('rejects a canonical slot outside its own published local trade day', () => {
    expect(() =>
      check(
        { ...event, scheduledAt: new Date('2026-09-21T20:00:00.000Z') },
        state,
      ),
    ).toThrow('Canonical Daily Trade snapshot');
  });

  it('rejects an event timezone different from its immutable policy snapshot', () => {
    expect(() =>
      check({ ...event, policyTimezoneSnapshot: 'UTC' }, state),
    ).toThrow('Canonical Daily Trade snapshot');
  });

  it('keeps strict same-timezone policy for V2 financial models', () => {
    expect(() =>
      check(event, { ...state, financialModelVersion: 'V2' }),
    ).toThrow('Canonical Daily Trade snapshot');
  });

  it('rejects different source event date even if timezone day matches', () => {
    expect(() =>
      check({ ...event, localActivityDate: '2026-09-22' }, state),
    ).toThrow('Canonical Daily Trade snapshot');
  });
});
