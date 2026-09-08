import {
  calculateNormalTradeTransition,
  calculateTargetReconciliationTransition,
  deterministicInternalTradeSlot,
} from './internal-trading-calculation';

describe('ITD-02B internal trading calculation', () => {
  const deterministicInput = {
    sourceKey: 'SUBSCRIPTION:sub-1:INTERNAL_TRADE:2026-09-01:SLOT:1',
    localTradeDate: '2026-09-01',
    slotNumber: 1,
    activitiesPerDay: 5,
    assetSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    winWeight: 3,
    lossWeight: 2,
    winMinimumPercent: '0.500000',
    winMaximumPercent: '2.500000',
    lossMinimumPercent: '0.250000',
    lossMaximumPercent: '1.500000',
    timingWindows: [
      {
        start: '09:00',
        end: '21:00',
      },
    ],
    timezoneSnapshot: 'Asia/Kolkata',
  };

  it('generates exactly the same deterministic trade for the same immutable seed', () => {
    const first = deterministicInternalTradeSlot(deterministicInput);

    const second = deterministicInternalTradeSlot(deterministicInput);

    expect(second).toEqual(first);

    expect(deterministicInput.assetSymbols).toContain(first.assetSymbol);

    if (first.outcome === 'WIN') {
      expect(Number(first.resultPercent)).toBeGreaterThanOrEqual(0.5);

      expect(Number(first.resultPercent)).toBeLessThanOrEqual(2.5);
    } else {
      expect(Number(first.resultPercent)).toBeLessThanOrEqual(-0.25);

      expect(Number(first.resultPercent)).toBeGreaterThanOrEqual(-1.5);
    }
  });

  it('creates exactly 3 WIN and 2 LOSS outcomes across a five-trade 3:2 day', () => {
    const outcomes = Array.from(
      { length: 5 },
      (_, index) =>
        deterministicInternalTradeSlot({
          ...deterministicInput,
          slotNumber: index + 1,
          sourceKey: `SUBSCRIPTION:sub-1:INTERNAL_TRADE:2026-09-01:SLOT:${index + 1}`,
        }).outcome,
    );

    expect(outcomes.filter((outcome) => outcome === 'WIN')).toHaveLength(3);

    expect(outcomes.filter((outcome) => outcome === 'LOSS')).toHaveLength(2);
  });

  it('keeps LOSS from reversing already credited wallet earnings', () => {
    const loss = calculateNormalTradeTransition(
      {
        grossTarget: '200',
        grossProgressBefore: '20',
        grossHighWaterBefore: '20',
        userSharePercent: '70',
        adminSharePercent: '30',
        userCreditedBefore: '14',
        adminRecognizedBefore: '6',
      },
      '-4',
    );

    expect(loss).toMatchObject({
      eventType: 'NORMAL',

      grossResultAmount: '-4.00000000',

      grossProgressBefore: '20.00000000',

      grossProgressAfter: '16.00000000',

      grossHighWaterBefore: '20.00000000',

      grossHighWaterAfter: '20.00000000',

      grossSettlementAmount: '0.00000000',

      userSettlementAmount: '0.00000000',

      adminSettlementAmount: '0.00000000',

      userCreditedAfter: '14.00000000',

      adminRecognizedAfter: '6.00000000',

      reachedGrossTarget: false,
    });
  });

  it('settles the full positive WIN even when progress starts below the previous high-water', () => {
    const win = calculateNormalTradeTransition(
      {
        grossTarget: '200',
        grossProgressBefore: '16',
        grossHighWaterBefore: '20',
        userSharePercent: '70',
        adminSharePercent: '30',
        userCreditedBefore: '14',
        adminRecognizedBefore: '6',
      },
      '6',
    );

    expect(win).toMatchObject({
      grossProgressAfter: '22.00000000',

      grossHighWaterAfter: '22.00000000',

      grossSettlementAmount: '6.00000000',

      userSettlementAmount: '4.20000000',

      adminSettlementAmount: '1.80000000',

      userCreditedAfter: '18.20000000',

      adminRecognizedAfter: '7.80000000',
    });
  });

  it('allows LOSS gross progress below zero without reversing previous settlements', () => {
    const result = calculateNormalTradeTransition(
      {
        grossTarget: '200',
        grossProgressBefore: '1',
        grossHighWaterBefore: '20',
        userSharePercent: '70',
        adminSharePercent: '30',
        userCreditedBefore: '14',
        adminRecognizedBefore: '6',
      },
      '-5',
    );

    expect(result.grossProgressAfter).toBe('-4.00000000');

    expect(result.grossHighWaterAfter).toBe('20.00000000');

    expect(result.grossSettlementAmount).toBe('0.00000000');
  });

  it('never allows a NORMAL trade to complete the gross target early', () => {
    const result = calculateNormalTradeTransition(
      {
        grossTarget: '100',
        grossProgressBefore: '99.90000000',
        grossHighWaterBefore: '99.90000000',
        userSharePercent: '70',
        adminSharePercent: '30',
        userCreditedBefore: '69.93000000',
        adminRecognizedBefore: '29.97000000',
      },
      '5',
    );

    expect(result.grossProgressAfter).toBe('99.99999999');

    expect(result.reachedGrossTarget).toBe(false);
  });

  it('closes the package to the exact gross target only through TARGET_RECONCILIATION', () => {
    const result = calculateTargetReconciliationTransition({
      grossTarget: '200',
      grossProgressBefore: '180',
      grossHighWaterBefore: '190',
      userSharePercent: '70',
      adminSharePercent: '30',
      userCreditedBefore: '133',
      adminRecognizedBefore: '57',
    });

    expect(result).toMatchObject({
      eventType: 'TARGET_RECONCILIATION',

      grossResultAmount: '20.00000000',

      grossProgressAfter: '200.00000000',

      grossHighWaterAfter: '200.00000000',

      grossSettlementAmount: '10.00000000',

      userSettlementAmount: '7.00000000',

      adminSettlementAmount: '3.00000000',

      userCreditedAfter: '140.00000000',

      adminRecognizedAfter: '60.00000000',

      reachedGrossTarget: true,
    });
  });

  it('uses cumulative split totals so event-level rounding cannot drift from the high-water amount', () => {
    const first = calculateNormalTradeTransition(
      {
        grossTarget: '10',
        grossProgressBefore: '0',
        grossHighWaterBefore: '0',
        userSharePercent: '70.000000',
        adminSharePercent: '30.000000',
        userCreditedBefore: '0',
        adminRecognizedBefore: '0',
      },
      '0.00000003',
    );

    expect(
      Number(first.userSettlementAmount) + Number(first.adminSettlementAmount),
    ).toBeCloseTo(Number(first.grossSettlementAmount), 8);

    const second = calculateNormalTradeTransition(
      {
        grossTarget: '10',
        grossProgressBefore: first.grossProgressAfter,
        grossHighWaterBefore: first.grossHighWaterAfter,
        userSharePercent: '70.000000',
        adminSharePercent: '30.000000',
        userCreditedBefore: first.userCreditedAfter,
        adminRecognizedBefore: first.adminRecognizedAfter,
      },
      '0.00000003',
    );

    expect(
      Number(second.userCreditedAfter) + Number(second.adminRecognizedAfter),
    ).toBeCloseTo(Number(second.grossHighWaterAfter), 8);
  });
});
