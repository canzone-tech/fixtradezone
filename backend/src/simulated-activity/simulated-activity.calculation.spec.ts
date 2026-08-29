import {
  deterministicSimulatedSlot,
  isLocalDateStartInstant,
  localDateForInstant,
  nextLocalDateStartUtc,
  validateTimingWindows,
} from './simulated-activity.calculation';
import { simulatedActivitySourceKey } from './simulated-activity.constants';

const policyVersionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const base = {
  localActivityDate: '2026-08-29',
  activitiesPerDay: 5,
  assetSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
  winWeight: 3,
  lossWeight: 2,
  winMinimumPercent: '0.500000',
  winMaximumPercent: '2.500000',
  lossMinimumPercent: '0.250000',
  lossMaximumPercent: '1.500000',
  timingWindows: [{ start: '09:00', end: '21:00' }],
  timezoneSnapshot: 'Asia/Kolkata',
};

describe('simulated activity deterministic calculation', () => {
  it('replays the exact same subscription/policy/date/slot deterministically', () => {
    const sourceKey = simulatedActivitySourceKey(
      '11111111-1111-4111-8111-111111111111',
      policyVersionId,
      base.localActivityDate,
      1,
    );
    const first = deterministicSimulatedSlot({
      ...base,
      sourceKey,
      slotNumber: 1,
    });
    const second = deterministicSimulatedSlot({
      ...base,
      sourceKey,
      slotNumber: 1,
    });

    expect(second).toEqual(first);
    expect(base.assetSymbols).toContain(first.assetSymbol);
    expect(['WIN', 'LOSS']).toContain(first.outcome);
    expect(Number(first.resultPercent)).toBe(
      first.outcome === 'WIN'
        ? Math.abs(Number(first.resultPercent))
        : -Math.abs(Number(first.resultPercent)),
    );
    expect(localDateForInstant(first.scheduledAt, base.timezoneSnapshot)).toBe(
      base.localActivityDate,
    );
  });

  it('keeps different policy versions in different deterministic identities', () => {
    const subscriptionId = '11111111-1111-4111-8111-111111111111';
    const first = simulatedActivitySourceKey(
      subscriptionId,
      policyVersionId,
      base.localActivityDate,
      1,
    );
    const second = simulatedActivitySourceKey(
      subscriptionId,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      base.localActivityDate,
      1,
    );

    expect(first).not.toBe(second);
  });

  it('spreads configured slots in chronological order within the daily window', () => {
    const subscriptionId = '22222222-2222-4222-8222-222222222222';
    const slots = Array.from({ length: base.activitiesPerDay }, (_, index) => {
      const slotNumber = index + 1;
      return deterministicSimulatedSlot({
        ...base,
        slotNumber,
        sourceKey: simulatedActivitySourceKey(
          subscriptionId,
          policyVersionId,
          base.localActivityDate,
          slotNumber,
        ),
      });
    });

    expect(slots.map((slot) => slot.scheduledAt.getTime())).toEqual(
      [...slots]
        .map((slot) => slot.scheduledAt.getTime())
        .sort((left, right) => left - right),
    );
    for (const slot of slots) {
      expect(localDateForInstant(slot.scheduledAt, base.timezoneSnapshot)).toBe(
        base.localActivityDate,
      );
    }
  });

  it('resolves the next local calendar-day boundary in the policy timezone', () => {
    const asOf = new Date('2026-08-28T12:00:00.000Z');
    const nextBoundary = nextLocalDateStartUtc(asOf, 'Asia/Kolkata');

    expect(nextBoundary.toISOString()).toBe('2026-08-28T18:30:00.000Z');
    expect(isLocalDateStartInstant(nextBoundary, 'Asia/Kolkata')).toBe(true);
    expect(localDateForInstant(nextBoundary, 'Asia/Kolkata')).toBe(
      '2026-08-29',
    );
  });

  it('rejects overlapping or insufficient timing windows', () => {
    expect(() =>
      validateTimingWindows(
        [
          { start: '09:00', end: '12:00' },
          { start: '11:00', end: '13:00' },
        ],
        5,
      ),
    ).toThrow('cannot overlap');

    expect(() =>
      validateTimingWindows([{ start: '09:00', end: '09:03' }], 5),
    ).toThrow('too small');
  });
});
