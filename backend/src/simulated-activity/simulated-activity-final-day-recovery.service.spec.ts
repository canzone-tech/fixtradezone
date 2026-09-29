import type { PrismaService } from '../database/prisma.service';
import { simulatedActivitySourceKey } from './simulated-activity.constants';
import { SimulatedActivityFinalDayRecoveryService } from './simulated-activity-final-day-recovery.service';

describe('SimulatedActivityFinalDayRecoveryService', () => {
  const subscriptionId = 'ed29a629-afb1-49f4-b2c5-14c8296b99dc';
  const userId = '74255bbf-a4b7-49e5-97fd-87321b9e33e8';
  const policyId = '421511ed-b251-11f1-b83f-bc2411688b53';
  const finalLocalDate = '2026-09-28';

  function createPrisma() {
    return {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
  }

  it('recovers missing final-day slots after the exact scheduledEndAt timestamp has elapsed', async () => {
    const prisma = createPrisma();
    const service = new SimulatedActivityFinalDayRecoveryService(
      prisma as unknown as PrismaService,
    );

    const candidate = {
      subscriptionId,
      userId,
      packagePlanVersionId: '81a93f76-f2e3-400b-9522-8dbaff82474c',
      packagePlanItemId: 'c88bcb7f-9b52-4b11-b635-986d467b6906',
      packageCode: 'FTZ_ALPHABOT',
      packageDisplayName: 'FTZ AlphaBot',
      scheduledEndAt: new Date('2026-09-28T14:13:52.117Z'),
      settlementTimezone: 'UTC',
      finalLocalDate,
      timezoneSnapshot: 'UTC',
    };
    const existingEvents = [1, 2, 3].map((slotNumber) => ({
      id: `existing-${slotNumber}`,
      sourceKey: simulatedActivitySourceKey(
        subscriptionId,
        policyId,
        finalLocalDate,
        slotNumber,
      ),
      policyVersionId: policyId,
      slotNumber,
    }));
    const policy = {
      id: policyId,
      versionNumber: 1,
      status: 'PUBLISHED' as const,
      enabled: true,
      activitiesPerDay: 5,
      minimumGapMinutes: 240,
      assetSymbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      winWeight: 7,
      lossWeight: 3,
      winMinimumPercent: '0.300000',
      winMaximumPercent: '2.500000',
      lossMinimumPercent: '0.300000',
      lossMaximumPercent: '1.000000',
      timingWindows: [{ start: '00:00', end: '23:59' }],
      timezoneSnapshot: 'UTC',
      effectiveFrom: new Date('2026-09-20T00:00:00.000Z'),
      effectiveTo: null,
    };

    prisma.$queryRaw
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce(existingEvents)
      .mockResolvedValueOnce([policy]);
    prisma.$executeRaw.mockResolvedValue(1);

    const summary = await service.processDueBatch(
      new Date('2026-09-29T04:31:08.462Z'),
    );

    expect(summary).toMatchObject({
      scannedSubscriptions: 1,
      processedSubscriptions: 1,
      createdEvents: 2,
      alreadyPresent: 3,
      skippedNotDue: 0,
      failedSubscriptions: 0,
      failures: [],
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);

    for (const call of prisma.$executeRaw.mock.calls) {
      const sql = call[0] as { values?: unknown[] };
      expect(sql.values).toContain(finalLocalDate);
      expect(sql.values).not.toContain('2026-09-29');
    }
  });

  it('fails closed instead of generating on a mismatched lifecycle timezone', async () => {
    const prisma = createPrisma();
    const service = new SimulatedActivityFinalDayRecoveryService(
      prisma as unknown as PrismaService,
    );

    prisma.$queryRaw.mockResolvedValueOnce([
      {
        subscriptionId,
        userId,
        packagePlanVersionId: '81a93f76-f2e3-400b-9522-8dbaff82474c',
        packagePlanItemId: 'c88bcb7f-9b52-4b11-b635-986d467b6906',
        packageCode: 'FTZ_ALPHABOT',
        packageDisplayName: 'FTZ AlphaBot',
        scheduledEndAt: new Date('2026-09-28T14:13:52.117Z'),
        settlementTimezone: 'UTC',
        finalLocalDate,
        timezoneSnapshot: 'Asia/Kolkata',
      },
    ]);

    const summary = await service.processDueBatch(
      new Date('2026-09-29T04:31:08.462Z'),
    );

    expect(summary.failedSubscriptions).toBe(1);
    expect(summary.createdEvents).toBe(0);
    expect(summary.failures[0]?.subscriptionId).toBe(subscriptionId);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
