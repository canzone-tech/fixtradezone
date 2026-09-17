import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  SIMULATED_ACTIVITY_DEFAULT_MINIMUM_GAP_MINUTES,
  SIMULATED_ACTIVITY_DEFAULT_PER_DAY,
  SIMULATED_ACTIVITY_DISCLOSURE,
} from './simulated-activity.constants';

const INITIAL_ASSET_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;
const INITIAL_TIMING_WINDOWS = [{ start: '00:00', end: '23:59' }] as const;
const INITIAL_WIN_WEIGHT = 3;
const INITIAL_LOSS_WEIGHT = 2;
const INITIAL_WIN_MINIMUM_PERCENT = '0.500000';
const INITIAL_WIN_MAXIMUM_PERCENT = '2.500000';
const INITIAL_LOSS_MINIMUM_PERCENT = '0.250000';
const INITIAL_LOSS_MAXIMUM_PERCENT = '1.500000';

interface InitialDraftTimestamps {
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SimulatedActivityInitialDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialDraft(
    reason: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.$queryRaw<{ id: string }[]>(
          Prisma.sql`
            SELECT id
            FROM simulated_activity_policy_versions
            ORDER BY versionNumber ASC
            LIMIT 1
            FOR UPDATE
          `,
        );
        if (existing.length > 0) {
          throw new ConflictException(
            'An initial simulated activity policy draft can only be created when no policy exists.',
          );
        }

        const id = randomUUID();
        const assetSymbols = [...INITIAL_ASSET_SYMBOLS];
        const timingWindows = INITIAL_TIMING_WINDOWS.map((window) => ({
          ...window,
        }));

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO simulated_activity_policy_versions (
            id, versionNumber, status, revision, enabled, activitiesPerDay,
            minimumGapMinutes, assetSymbols, winWeight, lossWeight,
            winMinimumPercent, winMaximumPercent,
            lossMinimumPercent, lossMaximumPercent,
            timingWindows, timezoneSnapshot,
            effectiveFrom, effectiveTo, publishedAt,
            clonedFromPolicyVersionId,
            createdByUserId, updatedByUserId, publishedByUserId,
            createdAt, updatedAt
          ) VALUES (
            ${id}, 1, 'DRAFT', 1, true, ${SIMULATED_ACTIVITY_DEFAULT_PER_DAY},
            ${SIMULATED_ACTIVITY_DEFAULT_MINIMUM_GAP_MINUTES},
            ${JSON.stringify(assetSymbols)},
            ${INITIAL_WIN_WEIGHT}, ${INITIAL_LOSS_WEIGHT},
            ${INITIAL_WIN_MINIMUM_PERCENT}, ${INITIAL_WIN_MAXIMUM_PERCENT},
            ${INITIAL_LOSS_MINIMUM_PERCENT}, ${INITIAL_LOSS_MAXIMUM_PERCENT},
            ${JSON.stringify(timingWindows)}, NULL,
            NULL, NULL, NULL,
            NULL, ${actor.id}, ${actor.id}, NULL,
            CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
          )
        `);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'CREATE',
            entityType: 'SimulatedActivityPolicyVersion',
            entityId: id,
            description: 'Initial simulated activity policy draft created.',
            metadata: {
              source: 'SIMULATED_ACTIVITY_POLICY',
              operation: 'CREATE_INITIAL_DRAFT',
              versionNumber: 1,
              reason,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        const timestamps = await transaction.$queryRaw<
          InitialDraftTimestamps[]
        >(Prisma.sql`
          SELECT createdAt, updatedAt
          FROM simulated_activity_policy_versions
          WHERE id = ${id}
          LIMIT 1
        `);

        return {
          id,
          versionNumber: 1,
          status: 'DRAFT' as const,
          revision: 1,
          enabled: true,
          activitiesPerDay: SIMULATED_ACTIVITY_DEFAULT_PER_DAY,
          minimumGapMinutes: SIMULATED_ACTIVITY_DEFAULT_MINIMUM_GAP_MINUTES,
          assetSymbols,
          winWeight: INITIAL_WIN_WEIGHT,
          lossWeight: INITIAL_LOSS_WEIGHT,
          winMinimumPercent: INITIAL_WIN_MINIMUM_PERCENT,
          winMaximumPercent: INITIAL_WIN_MAXIMUM_PERCENT,
          lossMinimumPercent: INITIAL_LOSS_MINIMUM_PERCENT,
          lossMaximumPercent: INITIAL_LOSS_MAXIMUM_PERCENT,
          timingWindows,
          timezoneSnapshot: null,
          effectiveFrom: null,
          effectiveTo: null,
          publishedAt: null,
          clonedFromPolicyVersionId: null,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          publishedByUserId: null,
          createdAt: timestamps[0]?.createdAt ?? null,
          updatedAt: timestamps[0]?.updatedAt ?? null,
          disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
          financialEffect: 'NONE' as const,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
