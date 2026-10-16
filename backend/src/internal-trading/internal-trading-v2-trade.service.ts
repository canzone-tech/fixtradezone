import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { addLocalDays } from './internal-trading-package-earnings';
import { v2DailyTradePlan } from './internal-trading-v2-plan';
import { recordTradeResultNotification } from '../notifications/trade-result-notification';

const MAX_DAYS_PER_RECONCILE = 1500;
const MAX_SERIALIZABLE_ATTEMPTS = 3;
const D8 = (value: Prisma.Decimal | string | number) =>
  new Prisma.Decimal(value).toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
const dateString = (value: string | Date) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

interface V2State {
  subscriptionId: string;
  userId: string;
  financialModelVersion: 'V2';
  splitPolicyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  currency: string;
  principalAmount: Prisma.Decimal;
  userSharePercent: Prisma.Decimal;
  adminSharePercent: Prisma.Decimal;
  timezoneSnapshot: string;
  activationLocalDate: Date | string;
  finalLocalDate: Date | string;
  nextTradeLocalDate: Date | string;
  grossNetProgress: Prisma.Decimal;
  grossHighWaterMark: Prisma.Decimal;
  settledTradeCount: number;
  revision: number;
  status: 'ACTIVE' | 'COMPLETED' | 'BLOCKED';
}
interface V2Terms {
  rewardRateMode: 'FIXED' | 'RANDOM_RANGE' | 'MANUAL' | 'RULE_BASED';
  fixedRewardRate: Prisma.Decimal | null;
  minimumRewardRate: Prisma.Decimal | null;
  maximumRewardRate: Prisma.Decimal | null;
  goalDays: number;
}
interface CanonicalEvent {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  userId: string;
  policyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  localActivityDate: string | Date;
  slotNumber: number;
  scheduledAt: Date;
  timezoneSnapshot: string;
  assetSymbol: string;
  outcome: 'WIN' | 'LOSS';
  resultPercent: Prisma.Decimal;
  activitiesPerDay: number;
}
interface ExistingEvent {
  id: string;
  slotNumber: number;
  simulatedActivityEventId: string | null;
  grossResultAmount: Prisma.Decimal;
}

@Injectable()
export class InternalTradingV2TradeService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcileSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser | null,
    context: RequestContext = {},
    generationSource: 'WORKER' | 'RECONCILIATION' = 'RECONCILIATION',
  ) {
    return this.runSerializable(async (tx) => {
      const stateRows = await tx.$queryRaw<V2State[]>(Prisma.sql`
        SELECT * FROM internal_trade_subscription_states
        WHERE subscriptionId = ${subscriptionId}
          AND financialModelVersion = 'V2'
        LIMIT 1 FOR UPDATE
      `);
      let state = stateRows[0];
      if (!state) {
        throw new ServiceUnavailableException('V2 state is unavailable.');
      }
      if (state.status === 'COMPLETED') {
        return {
          message: 'V2 package completed.',
          createdEvents: 0,
          createdSettlements: 0,
          state: { subscriptionId, status: 'COMPLETED' as const },
        };
      }
      if (state.status === 'BLOCKED') {
        throw new ConflictException('V2 package is blocked.');
      }
      const termRows = await tx.$queryRaw<V2Terms[]>(Prisma.sql`
        SELECT rewardRateMode, fixedRewardRate, minimumRewardRate,
          maximumRewardRate, goalDays
        FROM user_package_subscriptions
        WHERE id = ${subscriptionId}
          AND status = 'ACTIVE'
          AND earningAuthority = 'INTERNAL_TRADING'
        LIMIT 1 FOR SHARE
      `);
      const terms = termRows[0];
      if (!terms) {
        throw new ServiceUnavailableException(
          'V2 package earning terms are missing.',
        );
      }

      const expectedFinal = addLocalDays(
        dateString(state.activationLocalDate),
        terms.goalDays,
      );
      if (expectedFinal !== dateString(state.finalLocalDate)) {
        throw new ServiceUnavailableException(
          'V2 package duration snapshot mismatch.',
        );
      }
      const now = new Date();
      const asOfDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: state.timezoneSnapshot,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = asOfDate.formatToParts(now);
      const part = (type: 'year' | 'month' | 'day') =>
        parts.find((item) => item.type === type)?.value ?? '';
      const localToday = `${part('year')}-${part('month')}-${part('day')}`;
      const through = localToday < expectedFinal ? localToday : expectedFinal;
      let date = dateString(state.nextTradeLocalDate);
      let createdEvents = 0;
      const eventIds: string[] = [];

      for (
        let loop = 0;
        loop < MAX_DAYS_PER_RECONCILE && date <= through;
        loop += 1
      ) {
        const plan = v2DailyTradePlan({
          subscriptionId,
          localTradeDate: date,
          terms,
          activitiesPerDay: 5,
        });
        const canonical = await tx.$queryRaw<CanonicalEvent[]>(Prisma.sql`
          SELECT e.id, e.sourceKey, e.subscriptionId, e.userId,
            e.policyVersionId, e.packagePlanVersionId, e.packagePlanItemId,
            e.packageCode, e.localActivityDate, e.slotNumber, e.scheduledAt,
            e.timezoneSnapshot, e.assetSymbol, e.outcome, e.resultPercent,
            p.activitiesPerDay
          FROM simulated_trade_activity_events e
          INNER JOIN simulated_activity_policy_versions p
            ON p.id = e.policyVersionId
          WHERE e.subscriptionId = ${subscriptionId}
            AND e.localActivityDate = ${date}
          ORDER BY e.slotNumber ASC
          FOR SHARE
        `);
        if (canonical.length === 0) break;
        if (canonical.length > 5) {
          throw new ServiceUnavailableException(
            'V2 canonical day has more than five events.',
          );
        }
        canonical.forEach((event, index) => {
          const expected = plan.slots[index];
          if (
            event.activitiesPerDay !== 5 ||
            event.slotNumber !== index + 1 ||
            !expected ||
            event.outcome !== expected.outcome ||
            new Prisma.Decimal(event.resultPercent).toFixed(6) !==
              expected.resultPercent ||
            event.subscriptionId !== state.subscriptionId ||
            event.userId !== state.userId ||
            event.packagePlanVersionId !== state.packagePlanVersionId ||
            event.packagePlanItemId !== state.packagePlanItemId ||
            event.packageCode !== state.packageCode ||
            dateString(event.localActivityDate) !== date ||
            event.timezoneSnapshot !== state.timezoneSnapshot
          ) {
            throw new ServiceUnavailableException(
              'V2 canonical event does not match the immutable daily plan.',
            );
          }
        });
        const existing = await tx.$queryRaw<ExistingEvent[]>(Prisma.sql`
          SELECT id, slotNumber, simulatedActivityEventId, grossResultAmount
          FROM internal_trade_events
          WHERE subscriptionId = ${subscriptionId}
            AND localTradeDate = ${date}
          ORDER BY slotNumber ASC FOR UPDATE
        `);
        if (existing.length > canonical.length) {
          throw new ServiceUnavailableException(
            'V2 event count exceeds canonical source.',
          );
        }
        existing.forEach((event, index) => {
          if (
            event.slotNumber !== index + 1 ||
            event.simulatedActivityEventId !== canonical[index]?.id
          ) {
            throw new ServiceUnavailableException(
              'V2 history contains a mismatched slot.',
            );
          }
        });

        let completed = existing.length === 5;
        for (
          let index = existing.length;
          index < canonical.length;
          index += 1
        ) {
          const e = canonical[index];
          if (e.scheduledAt > now) {
            completed = false;
            break;
          }
          const amount = D8(
            new Prisma.Decimal(state.principalAmount)
              .mul(new Prisma.Decimal(e.resultPercent))
              .div(100),
          );
          if (
            amount.eq(0) ||
            (e.outcome === 'WIN' && amount.lte(0)) ||
            (e.outcome === 'LOSS' && amount.gte(0))
          ) {
            throw new ServiceUnavailableException(
              'V2 signed trade amount is invalid.',
            );
          }
          const before = D8(state.grossNetProgress);
          const after = D8(before.add(amount));
          const highBefore = D8(state.grossHighWaterMark);
          const highAfter = D8(Prisma.Decimal.max(highBefore, after));
          const dayNumber =
            Math.round(
              (Date.parse(`${date}T00:00:00Z`) -
                Date.parse(
                  `${addLocalDays(dateString(state.activationLocalDate), 1)}T00:00:00Z`,
                )) /
                86_400_000,
            ) + 1;
          const eventId = randomUUID();
          const sourceKey = `CANONICAL_DAILY_TRADE:${e.id}:INTERNAL_TRADING_V2`;
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO internal_trade_events (
              id, sourceKey, simulatedActivityEventId,
              subscriptionId, financialModelVersion, userId,
              policyVersionId, packagePlanVersionId, packagePlanItemId,
              packageCode, packageDisplayName, currency, grossTarget,
              localTradeDate, tradeDayNumber, slotNumber, scheduledAt,
              timezoneSnapshot, assetSymbol, outcome, eventType,
              resultPercent, grossResultAmount, financialAdjustmentAmount,
              grossProgressBefore, grossProgressAfter,
              grossHighWaterBefore, grossHighWaterAfter,
              settlementMode, grossSettlementAmount, userShareAmount,
              adminShareAmount, ledgerTransactionId,
              generationSource, generatedByUserId, generatedAt, createdAt
            ) VALUES (
              ${eventId}, ${sourceKey}, ${e.id},
              ${subscriptionId}, 'V2', ${state.userId},
              ${state.splitPolicyVersionId}, ${state.packagePlanVersionId},
              ${state.packagePlanItemId}, ${state.packageCode},
              ${state.packageDisplayName}, ${state.currency}, 0,
              ${date}, ${dayNumber}, ${e.slotNumber}, ${e.scheduledAt},
              ${state.timezoneSnapshot}, ${e.assetSymbol}, ${e.outcome}, 'NORMAL',
              ${new Prisma.Decimal(e.resultPercent).toFixed(6)},
              ${amount.toFixed(8)}, 0,
              ${before.toFixed(8)}, ${after.toFixed(8)},
              ${highBefore.toFixed(8)}, ${highAfter.toFixed(8)},
              'CLAIM_PENDING', 0, 0, 0, NULL,
              ${generationSource}, ${actor?.id ?? null}, ${now},
              CURRENT_TIMESTAMP(3)
            )
          `);

          await recordTradeResultNotification(tx, {
            userId: state.userId,
            eventId,
            assetSymbol: e.assetSymbol,
            outcome: e.outcome,
            slotNumber: e.slotNumber,
          });

          const isFinal = date === expectedFinal && e.slotNumber === 5;
          const updated = await tx.$executeRaw(Prisma.sql`
            UPDATE internal_trade_subscription_states SET
              grossNetProgress = ${after.toFixed(8)},
              grossHighWaterMark = ${highAfter.toFixed(8)},
              settledTradeCount = settledTradeCount + 1,
              status = ${isFinal ? 'COMPLETED' : 'ACTIVE'},
              completionReason = ${isFinal ? 'DURATION_ELAPSED' : null},
              completedAt = ${isFinal ? now : null},
              revision = revision + 1,
              updatedAt = CURRENT_TIMESTAMP(3)
            WHERE subscriptionId = ${subscriptionId}
              AND revision = ${state.revision}
          `);
          if (updated !== 1)
            throw new ConflictException('V2 state revision changed.');
          state = {
            ...state,
            grossNetProgress: after,
            grossHighWaterMark: highAfter,
            settledTradeCount: Number(state.settledTradeCount) + 1,
            revision: state.revision + 1,
            status: isFinal ? 'COMPLETED' : 'ACTIVE',
          };
          createdEvents += 1;
          eventIds.push(eventId);
          completed = e.slotNumber === 5;
        }
        if (!completed) break;

        const totals = await tx.$queryRaw<
          Array<{
            total: Prisma.Decimal;
            count: bigint;
          }>
        >(Prisma.sql`
          SELECT COALESCE(SUM(grossResultAmount), 0) AS total,
            COUNT(*) AS count
          FROM internal_trade_events
          WHERE subscriptionId = ${subscriptionId}
            AND financialModelVersion = 'V2'
            AND localTradeDate = ${date}
        `);
        const total = totals[0];
        if (Number(total?.count ?? 0) !== 5) {
          throw new ServiceUnavailableException(
            'V2 daily claim requires five trades.',
          );
        }
        const gross = D8(total.total);
        const nominalGross = D8(
          new Prisma.Decimal(state.principalAmount)
            .mul(plan.dailyGrossRatePercent)
            .div(100),
        );
        // Five independently rounded 8dp amounts can differ by a few
        // one-satoshi units from the single rounded daily target.
        if (
          gross.lte(0) ||
          gross.sub(nominalGross).abs().gt(new Prisma.Decimal('0.00000003'))
        ) {
          throw new ServiceUnavailableException(
            'V2 five signed trade amounts do not reconcile to daily NET profit.',
          );
        }
        const user = D8(gross.mul(state.userSharePercent).div(100));
        if (user.lte(0)) {
          throw new ServiceUnavailableException(
            'V2 USER amount rounds to zero.',
          );
        }
        const admin = D8(gross.sub(user));
        const claimId = randomUUID();
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO internal_trade_daily_claims (
            id, subscriptionId, userId, localTradeDate, currency,
            dailyGrossRatePercent, dailyNetGrossAmount, userSharePercent,
            adminSharePercent, userAmount, adminAmount, tradeCount,
            status, createdAt
          ) VALUES (
            ${claimId}, ${subscriptionId}, ${state.userId}, ${date},
            ${state.currency}, ${plan.dailyGrossRatePercent},
            ${gross.toFixed(8)}, ${new Prisma.Decimal(state.userSharePercent).toFixed(6)},
            ${new Prisma.Decimal(state.adminSharePercent).toFixed(6)},
            ${user.toFixed(8)}, ${admin.toFixed(8)}, 5, 'PENDING',
            CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE id = id
        `);

        if (date === expectedFinal) break;
        const next = addLocalDays(date, 1);
        const advanced = await tx.$executeRaw(Prisma.sql`
          UPDATE internal_trade_subscription_states SET
            nextTradeLocalDate = ${next},
            revision = revision + 1,
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE subscriptionId = ${subscriptionId}
            AND revision = ${state.revision}
        `);
        if (advanced !== 1)
          throw new ConflictException('V2 day advance conflict.');
        state = {
          ...state,
          nextTradeLocalDate: next,
          revision: state.revision + 1,
        };
        date = next;
      }

      if (createdEvents > 0) {
        await tx.auditLog.create({
          data: {
            actorUserId: actor?.id ?? null,
            action: 'CREATE',
            entityType: 'InternalTradingV2DailyActivity',
            entityId: subscriptionId,
            description:
              'V2 canonical generated trading events reconciled without wallet settlement.',
            metadata: {
              operation: 'RECONCILE_V2_TRADES',
              financialModelVersion: 'V2',
              subscriptionId,
              eventIds,
              createdEvents,
              generatedSource: generationSource,
              settlementMode: 'MANUAL_DAILY_CLAIM',
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }
      return {
        message: createdEvents
          ? 'V2 due trades reconciled.'
          : 'No V2 due trades.',
        createdEvents,
        createdSettlements: 0,
        eventIds,
        state: { subscriptionId, status: state.status },
      };
    });
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const known = error instanceof Prisma.PrismaClientKnownRequestError;
        const adapter = (known ? error.meta?.driverAdapterError : undefined) as
          { cause?: { originalCode?: string | number } } | undefined;
        // Prisma 7 MariaDB adapter may surface ER_LOCK_DEADLOCK (1213)
        // as P2010 rather than P2034. Retry the entire rolled-back transaction.
        const retryable =
          known &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' &&
              String(adapter?.cause?.originalCode) === '1213'));
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, attempt * 50));
      }
    }
    throw new ServiceUnavailableException(
      'V2 reconciliation retries exhausted.',
    );
  }
}
