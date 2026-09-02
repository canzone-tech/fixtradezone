import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  InternalTradingEventQueryDto,
  InternalTradingWorkspaceQueryDto,
} from './dto/internal-trading-trade.dto';
import {
  calculateNormalTradeTransition,
  calculateTargetReconciliationTransition,
  deterministicInternalTradeSlot,
} from './internal-trading-calculation';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_RECONCILE_DAYS = 1500;

type DecimalValue = Prisma.Decimal | number | string;

interface CountRow {
  total: bigint | number | string;
}

interface StateRow {
  subscriptionId: string;
  userId: string;
  splitPolicyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  currency: string;
  principalAmount: DecimalValue;
  grossMultiplier: DecimalValue;
  grossTarget: DecimalValue;
  userSharePercent: DecimalValue;
  adminSharePercent: DecimalValue;
  timezoneSnapshot: string;
  activationLocalDate: string | Date;
  finalLocalDate: string | Date;
  grossNetProgress: DecimalValue;
  grossHighWaterMark: DecimalValue;
  userCreditedAmount: DecimalValue;
  adminRecognizedAmount: DecimalValue;
  nextTradeLocalDate: string | Date;
  settledTradeCount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'BLOCKED';
  completionReason: 'TARGET_REACHED_AT_DURATION_END' | null;
  blockedReason: string | null;
  revision: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  username?: string;
  email?: string | null;
}

interface PolicyRow {
  id: string;
  versionNumber: number;
  status: 'PUBLISHED';
  enabled: boolean | number;
  activitiesPerDay: number;
  assetSymbols: unknown;
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: DecimalValue;
  winMaximumPercent: DecimalValue;
  lossMinimumPercent: DecimalValue;
  lossMaximumPercent: DecimalValue;
  timingWindows: unknown;
  timezoneSnapshot: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface EventRow {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  userId: string;
  policyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  currency: string;
  grossTarget: DecimalValue;
  localTradeDate: string | Date;
  tradeDayNumber: number;
  slotNumber: number;
  scheduledAt: Date;
  timezoneSnapshot: string;
  assetSymbol: string;
  outcome: 'WIN' | 'LOSS';
  eventType: 'NORMAL' | 'TARGET_RECONCILIATION';
  resultPercent: DecimalValue;
  grossResultAmount: DecimalValue;
  grossProgressBefore: DecimalValue;
  grossProgressAfter: DecimalValue;
  grossHighWaterBefore: DecimalValue;
  grossHighWaterAfter: DecimalValue;
  settlementMode: 'HIGH_WATER' | 'WIN_IMMEDIATE' | null;
  grossSettlementAmount: DecimalValue;
  userShareAmount: DecimalValue;
  adminShareAmount: DecimalValue;
  ledgerTransactionId: string | null;
  generationSource: 'WORKER' | 'RECONCILIATION';
  generatedByUserId: string | null;
  generatedAt: Date;
  createdAt: Date;
}

interface AccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket:
    | 'PACKAGE_EARNINGS'
    | 'INTERNAL_TRADING_RETURN_EXPENSE'
    | 'INTERNAL_TRADING_ADMIN_PROFIT';
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

interface BalanceSideRow {
  side: 'DEBIT' | 'CREDIT';
  total: DecimalValue;
}

@Injectable()
export class InternalTradingTradeService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdminWorkspace(query: InternalTradingWorkspaceQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const rows = await this.prisma.$queryRaw<StateRow[]>(Prisma.sql`
      SELECT
        s.*,
        u.username,
        u.email
      FROM internal_trade_subscription_states s
      INNER JOIN users u ON u.id = s.userId
      ORDER BY
        FIELD(s.status, 'ACTIVE', 'BLOCKED', 'COMPLETED'),
        s.updatedAt DESC,
        s.subscriptionId DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);

    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM internal_trade_subscription_states
    `);

    const aggregateRows = await this.prisma.$queryRaw<
      Array<{
        activeCount: DecimalValue;
        completedCount: DecimalValue;
        blockedCount: DecimalValue;
        totalPrincipal: DecimalValue;
        totalGrossTarget: DecimalValue;
        totalUserCredited: DecimalValue;
        totalAdminRecognized: DecimalValue;
      }>
    >(Prisma.sql`
      SELECT
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeCount,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedCount,
        SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) AS blockedCount,
        COALESCE(SUM(principalAmount), 0) AS totalPrincipal,
        COALESCE(SUM(grossTarget), 0) AS totalGrossTarget,
        COALESCE(SUM(userCreditedAmount), 0) AS totalUserCredited,
        COALESCE(SUM(adminRecognizedAmount), 0) AS totalAdminRecognized
      FROM internal_trade_subscription_states
    `);

    const totals = aggregateRows[0];

    return {
      scope: 'INTERNAL_TRADING',
      financialModel: 'GROSS_BEFORE_SPLIT',
      resultBasis: 'PACKAGE_PRINCIPAL',
      highWaterSettlement: false,
      settlementMode: 'WIN_IMMEDIATE',
      highWaterTracking: true,
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
      totals: {
        active: this.countNumber(totals?.activeCount),
        completed: this.countNumber(totals?.completedCount),
        blocked: this.countNumber(totals?.blockedCount),
        principal: this.moneyString(totals?.totalPrincipal ?? 0),
        grossTarget: this.moneyString(totals?.totalGrossTarget ?? 0),
        userCredited: this.moneyString(totals?.totalUserCredited ?? 0),
        adminRecognized: this.moneyString(totals?.totalAdminRecognized ?? 0),
      },
      states: rows.map((row) => this.stateSnapshot(row)),
    };
  }

  async getAdminState(subscriptionId: string) {
    const state = await this.requireState(this.prisma, subscriptionId, false);

    return this.stateSnapshot(state);
  }

  async getMyPackages(userId: string) {
    const rows = await this.prisma.$queryRaw<StateRow[]>(Prisma.sql`
      SELECT *
      FROM internal_trade_subscription_states
      WHERE userId = ${userId}
      ORDER BY
        FIELD(status, 'ACTIVE', 'BLOCKED', 'COMPLETED'),
        createdAt DESC
    `);

    return {
      scope: 'MY_INTERNAL_TRADING',
      financialModel: 'GROSS_BEFORE_SPLIT',
      resultBasis: 'PACKAGE_PRINCIPAL',
      highWaterSettlement: false,
      settlementMode: 'WIN_IMMEDIATE',
      highWaterTracking: true,
      packages: rows.map((row) => this.userStateSnapshot(row)),
    };
  }

  async getMyPackage(userId: string, subscriptionId: string) {
    const rows = await this.prisma.$queryRaw<StateRow[]>(Prisma.sql`
      SELECT *
      FROM internal_trade_subscription_states
      WHERE subscriptionId = ${subscriptionId}
        AND userId = ${userId}
      LIMIT 1
    `);

    const state = rows[0];

    if (!state) {
      throw new NotFoundException('Internal trading package was not found.');
    }

    return this.userStateSnapshot(state);
  }

  async listAdminEvents(
    subscriptionId: string,
    query: InternalTradingEventQueryDto,
  ) {
    await this.requireState(this.prisma, subscriptionId, false);

    return this.listEvents(subscriptionId, query, false);
  }

  async listMyEvents(
    userId: string,
    subscriptionId: string,
    query: InternalTradingEventQueryDto,
  ) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT subscriptionId AS id
      FROM internal_trade_subscription_states
      WHERE subscriptionId = ${subscriptionId}
        AND userId = ${userId}
      LIMIT 1
    `);

    if (!rows[0]) {
      throw new NotFoundException('Internal trading package was not found.');
    }

    return this.listEvents(subscriptionId, query, true);
  }

  async listWorkerCandidates(
    afterSubscriptionId: string | null,
    limit: number,
  ): Promise<string[]> {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));

    const cursorFilter = afterSubscriptionId
      ? Prisma.sql`AND s.subscriptionId > ${afterSubscriptionId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{ subscriptionId: string }>
    >(Prisma.sql`
      SELECT s.subscriptionId
      FROM internal_trade_subscription_states s
      INNER JOIN user_package_subscriptions ups
        ON ups.id = s.subscriptionId
      WHERE s.status = 'ACTIVE'
        AND ups.status = 'ACTIVE'
        AND ups.earningAuthority = 'INTERNAL_TRADING'
        ${cursorFilter}
      ORDER BY s.subscriptionId ASC
      LIMIT ${safeLimit}
    `);

    return rows.map((row) => row.subscriptionId);
  }

  async reconcileSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser | null,
    context: RequestContext = {},
    generationSource: 'WORKER' | 'RECONCILIATION' = 'RECONCILIATION',
  ) {
    return this.runSerializable(async (transaction) => {
      let state = await this.requireState(transaction, subscriptionId, true);

      if (state.status === 'COMPLETED') {
        return {
          message: 'Internal trading package is already completed.',
          createdEvents: 0,
          createdSettlements: 0,
          state: this.stateSnapshot(state),
        };
      }

      if (state.status === 'BLOCKED') {
        throw new ConflictException(
          state.blockedReason || 'Internal trading package is blocked.',
        );
      }

      const now = new Date();
      const currentLocalDate = this.localDateInTimezone(
        now,
        state.timezoneSnapshot,
      );

      const finalLocalDate = this.localDateString(state.finalLocalDate);

      const throughLocalDate =
        currentLocalDate < finalLocalDate ? currentLocalDate : finalLocalDate;

      let nextTradeLocalDate = this.localDateString(state.nextTradeLocalDate);

      if (nextTradeLocalDate > throughLocalDate) {
        return {
          message: 'No internal trades are due.',
          createdEvents: 0,
          createdSettlements: 0,
          state: this.stateSnapshot(state),
        };
      }

      let createdEvents = 0;
      let createdSettlements = 0;
      const createdEventIds: string[] = [];

      for (
        let dayGuard = 0;
        dayGuard < MAX_RECONCILE_DAYS && nextTradeLocalDate <= throughLocalDate;
        dayGuard += 1
      ) {
        const localTradeDate = nextTradeLocalDate;

        const policy = await this.requireEffectivePolicy(
          transaction,
          localTradeDate,
          state.timezoneSnapshot,
        );

        const existingSlots = await transaction.$queryRaw<
          Array<{ slotNumber: number }>
        >(Prisma.sql`
          SELECT slotNumber
          FROM internal_trade_events
          WHERE subscriptionId = ${state.subscriptionId}
            AND localTradeDate = ${localTradeDate}
          ORDER BY slotNumber ASC
          FOR UPDATE
        `);

        existingSlots.forEach((row, index) => {
          if (row.slotNumber !== index + 1) {
            throw new ServiceUnavailableException(
              'Internal trading event slots are not contiguous.',
            );
          }
        });

        if (existingSlots.length > policy.activitiesPerDay) {
          throw new ServiceUnavailableException(
            'Internal trading event count exceeds the effective daily policy.',
          );
        }

        const tradeDayNumber =
          this.daysBetween(
            this.localDateString(state.activationLocalDate),
            localTradeDate,
          ) + 1;

        let completedDay = existingSlots.length === policy.activitiesPerDay;

        for (
          let slotNumber = existingSlots.length + 1;
          slotNumber <= policy.activitiesPerDay;
          slotNumber += 1
        ) {
          const sourceKey = this.tradeSourceKey(
            state.subscriptionId,
            localTradeDate,
            slotNumber,
          );

          const deterministic = deterministicInternalTradeSlot({
            sourceKey,
            localTradeDate,
            slotNumber,
            activitiesPerDay: policy.activitiesPerDay,
            assetSymbols: this.stringArray(policy.assetSymbols),
            winWeight: policy.winWeight,
            lossWeight: policy.lossWeight,
            winMinimumPercent: policy.winMinimumPercent,
            winMaximumPercent: policy.winMaximumPercent,
            lossMinimumPercent: policy.lossMinimumPercent,
            lossMaximumPercent: policy.lossMaximumPercent,
            timingWindows: this.timingWindows(policy.timingWindows),
            timezoneSnapshot: state.timezoneSnapshot,
          });

          const dayIsPast = localTradeDate < currentLocalDate;

          if (
            !dayIsPast &&
            deterministic.scheduledAt.getTime() > now.getTime()
          ) {
            completedDay = false;
            break;
          }

          const finalSlot =
            localTradeDate === finalLocalDate &&
            slotNumber === policy.activitiesPerDay;

          let outcome: 'WIN' | 'LOSS';
          let eventType: 'NORMAL' | 'TARGET_RECONCILIATION';
          let resultPercent: string;
          let transition;

          if (finalSlot) {
            transition = calculateTargetReconciliationTransition({
              grossTarget: state.grossTarget,
              grossProgressBefore: state.grossNetProgress,
              grossHighWaterBefore: state.grossHighWaterMark,
              userSharePercent: state.userSharePercent,
              adminSharePercent: state.adminSharePercent,
              userCreditedBefore: state.userCreditedAmount,
              adminRecognizedBefore: state.adminRecognizedAmount,
            });

            outcome = 'WIN';
            eventType = 'TARGET_RECONCILIATION';

            resultPercent = new Prisma.Decimal(transition.grossResultAmount)
              .div(new Prisma.Decimal(state.principalAmount))
              .mul(100)
              .toDecimalPlaces(6, 4)
              .toFixed(6);
          } else {
            outcome = deterministic.outcome;
            resultPercent = deterministic.resultPercent;
            eventType = 'NORMAL';

            let grossResultAmount = this.principalResultAmount(
              state.principalAmount,
              resultPercent,
            );

            const projected = new Prisma.Decimal(state.grossNetProgress).add(
              grossResultAmount,
            );

            if (
              outcome === 'WIN' &&
              projected.gte(new Prisma.Decimal(state.grossTarget))
            ) {
              const protectedTrade = deterministicInternalTradeSlot({
                sourceKey: `${sourceKey}:TARGET_PROTECTION`,
                localTradeDate,
                slotNumber,
                activitiesPerDay: policy.activitiesPerDay,
                assetSymbols: this.stringArray(policy.assetSymbols),
                winWeight: 0,
                lossWeight: 1,
                winMinimumPercent: policy.winMinimumPercent,
                winMaximumPercent: policy.winMaximumPercent,
                lossMinimumPercent: policy.lossMinimumPercent,
                lossMaximumPercent: policy.lossMaximumPercent,
                timingWindows: this.timingWindows(policy.timingWindows),
                timezoneSnapshot: state.timezoneSnapshot,
              });

              outcome = 'LOSS';
              resultPercent = protectedTrade.resultPercent;
              grossResultAmount = this.principalResultAmount(
                state.principalAmount,
                resultPercent,
              );
            }

            if (new Prisma.Decimal(grossResultAmount).eq(0)) {
              throw new ServiceUnavailableException(
                'Internal trade result rounded to zero.',
              );
            }

            transition = calculateNormalTradeTransition(
              {
                grossTarget: state.grossTarget,
                grossProgressBefore: state.grossNetProgress,
                grossHighWaterBefore: state.grossHighWaterMark,
                userSharePercent: state.userSharePercent,
                adminSharePercent: state.adminSharePercent,
                userCreditedBefore: state.userCreditedAmount,
                adminRecognizedBefore: state.adminRecognizedAmount,
              },
              grossResultAmount,
            );
          }

          const eventId = randomUUID();

          const ledgerTransactionId = new Prisma.Decimal(
            transition.grossSettlementAmount,
          ).gt(0)
            ? await this.postSettlement(
                transaction,
                {
                  eventId,
                  sourceKey,
                  subscriptionId: state.subscriptionId,
                  userId: state.userId,
                  packageCode: state.packageCode,
                  currency: state.currency,
                  grossSettlementAmount: transition.grossSettlementAmount,
                  userShareAmount: transition.userSettlementAmount,
                  adminShareAmount: transition.adminSettlementAmount,
                },
                actor,
                context,
              )
            : null;

          if (ledgerTransactionId) {
            createdSettlements += 1;
          }

          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO internal_trade_events (
              id,
              sourceKey,
              subscriptionId,
              userId,
              policyVersionId,
              packagePlanVersionId,
              packagePlanItemId,
              packageCode,
              packageDisplayName,
              currency,
              grossTarget,
              localTradeDate,
              tradeDayNumber,
              slotNumber,
              scheduledAt,
              timezoneSnapshot,
              assetSymbol,
              outcome,
              eventType,
              resultPercent,
              grossResultAmount,
              grossProgressBefore,
              grossProgressAfter,
              grossHighWaterBefore,
              grossHighWaterAfter,
              settlementMode,
              grossSettlementAmount,
              userShareAmount,
              adminShareAmount,
              ledgerTransactionId,
              generationSource,
              generatedByUserId,
              generatedAt,
              createdAt
            ) VALUES (
              ${eventId},
              ${sourceKey},
              ${state.subscriptionId},
              ${state.userId},
              ${policy.id},
              ${state.packagePlanVersionId},
              ${state.packagePlanItemId},
              ${state.packageCode},
              ${state.packageDisplayName},
              ${state.currency},
              ${this.moneyString(state.grossTarget)},
              ${localTradeDate},
              ${tradeDayNumber},
              ${slotNumber},
              ${deterministic.scheduledAt},
              ${state.timezoneSnapshot},
              ${deterministic.assetSymbol},
              ${outcome},
              ${eventType},
              ${resultPercent},
              ${transition.grossResultAmount},
              ${transition.grossProgressBefore},
              ${transition.grossProgressAfter},
              ${transition.grossHighWaterBefore},
              ${transition.grossHighWaterAfter},
              'WIN_IMMEDIATE',
              ${transition.grossSettlementAmount},
              ${transition.userSettlementAmount},
              ${transition.adminSettlementAmount},
              ${ledgerTransactionId},
              ${generationSource},
              ${actor?.id ?? null},
              ${now},
              CURRENT_TIMESTAMP(3)
            )
          `);

          const completing = finalSlot && transition.reachedGrossTarget;

          const updated = await transaction.$executeRaw(Prisma.sql`
            UPDATE internal_trade_subscription_states
            SET
              grossNetProgress =
                ${transition.grossProgressAfter},
              grossHighWaterMark =
                ${transition.grossHighWaterAfter},
              userCreditedAmount =
                ${transition.userCreditedAfter},
              adminRecognizedAmount =
                ${transition.adminRecognizedAfter},
              settledTradeCount = settledTradeCount + 1,
              status =
                ${completing ? 'COMPLETED' : 'ACTIVE'},
              completionReason =
                ${completing ? 'TARGET_REACHED_AT_DURATION_END' : null},
              completedAt =
                ${completing ? now : null},
              revision = revision + 1,
              updatedAt = CURRENT_TIMESTAMP(3)
            WHERE subscriptionId = ${state.subscriptionId}
              AND revision = ${state.revision}
          `);

          if (updated !== 1) {
            throw new ConflictException(
              'Internal trading state changed during reconciliation.',
            );
          }

          state = {
            ...state,
            grossNetProgress: transition.grossProgressAfter,
            grossHighWaterMark: transition.grossHighWaterAfter,
            userCreditedAmount: transition.userCreditedAfter,
            adminRecognizedAmount: transition.adminRecognizedAfter,
            settledTradeCount: Number(state.settledTradeCount) + 1,
            status: completing ? 'COMPLETED' : 'ACTIVE',
            completionReason: completing
              ? 'TARGET_REACHED_AT_DURATION_END'
              : null,
            completedAt: completing ? now : null,
            revision: state.revision + 1,
            updatedAt: now,
          };

          createdEvents += 1;
          createdEventIds.push(eventId);

          if (completing) {
            completedDay = true;
            break;
          }

          completedDay = slotNumber === policy.activitiesPerDay;
        }

        if (state.status === 'COMPLETED') {
          break;
        }

        if (!completedDay) {
          break;
        }

        const tomorrow = this.addLocalDays(localTradeDate, 1);

        const advanced = await transaction.$executeRaw(Prisma.sql`
          UPDATE internal_trade_subscription_states
          SET
            nextTradeLocalDate = ${tomorrow},
            revision = revision + 1,
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE subscriptionId = ${state.subscriptionId}
            AND revision = ${state.revision}
        `);

        if (advanced !== 1) {
          throw new ConflictException(
            'Internal trading state changed while advancing its trading day.',
          );
        }

        state = {
          ...state,
          nextTradeLocalDate: tomorrow,
          revision: state.revision + 1,
          updatedAt: now,
        };

        nextTradeLocalDate = tomorrow;
      }

      if (createdEvents > 0) {
        await transaction.auditLog.create({
          data: {
            actorUserId: actor?.id ?? null,
            action: 'UPDATE',
            entityType: 'InternalTradingSubscriptionState',
            entityId: state.subscriptionId,
            description: 'Internal trading due trades reconciled.',
            metadata: {
              source: 'INTERNAL_TRADING',
              operation: 'RECONCILE_TRADES',
              subscriptionId: state.subscriptionId,
              createdEvents,
              createdSettlements,
              eventIds: createdEventIds,
              financialModel: 'GROSS_BEFORE_SPLIT',
              resultBasis: 'PACKAGE_PRINCIPAL',
              highWaterSettlement: false,
              settlementMode: 'WIN_IMMEDIATE',
              highWaterTracking: true,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }

      return {
        message:
          createdEvents > 0
            ? 'Internal trading due trades reconciled.'
            : 'No internal trades were due.',
        createdEvents,
        createdSettlements,
        eventIds: createdEventIds,
        state: this.stateSnapshot(state),
      };
    });
  }

  private async listEvents(
    subscriptionId: string,
    query: InternalTradingEventQueryDto,
    userView: boolean,
  ) {
    const skip = (query.page - 1) * query.limit;

    const dateFilter = query.localDate
      ? Prisma.sql`AND localTradeDate = ${query.localDate}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<EventRow[]>(Prisma.sql`
      SELECT *
      FROM internal_trade_events
      WHERE subscriptionId = ${subscriptionId}
        ${dateFilter}
      ORDER BY localTradeDate DESC, slotNumber DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);

    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM internal_trade_events
      WHERE subscriptionId = ${subscriptionId}
        ${dateFilter}
    `);

    return {
      subscriptionId,
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
      events: rows.map((row) =>
        userView ? this.userEventSnapshot(row) : this.eventSnapshot(row),
      ),
    };
  }

  private async requireEffectivePolicy(
    transaction: Prisma.TransactionClient,
    localTradeDate: string,
    timezone: string,
  ): Promise<PolicyRow> {
    const dayStart = deterministicInternalTradeSlot({
      sourceKey: `POLICY_BOUNDARY:${localTradeDate}`,
      localTradeDate,
      slotNumber: 1,
      activitiesPerDay: 1,
      assetSymbols: ['BOUNDARY'],
      winWeight: 1,
      lossWeight: 0,
      winMinimumPercent: '1',
      winMaximumPercent: '1',
      lossMinimumPercent: '1',
      lossMaximumPercent: '1',
      timingWindows: [{ start: '00:00', end: '00:01' }],
      timezoneSnapshot: timezone,
    }).scheduledAt;

    const rows = await transaction.$queryRaw<PolicyRow[]>(Prisma.sql`
      SELECT *
      FROM internal_trade_policy_versions
      WHERE status = 'PUBLISHED'
        AND enabled = 1
        AND effectiveFrom IS NOT NULL
        AND effectiveFrom <= ${dayStart}
        AND (
          effectiveTo IS NULL
          OR effectiveTo > ${dayStart}
        )
      ORDER BY effectiveFrom DESC, versionNumber DESC
      LIMIT 1
      FOR SHARE
    `);

    const policy = rows[0];

    if (!policy) {
      throw new ServiceUnavailableException(
        `No effective internal trading policy exists for ${localTradeDate}.`,
      );
    }

    return policy;
  }

  private async requireState(
    client: PrismaService | Prisma.TransactionClient,
    subscriptionId: string,
    lock: boolean,
  ): Promise<StateRow> {
    const lockSql = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;

    const rows = await client.$queryRaw<StateRow[]>(Prisma.sql`
      SELECT *
      FROM internal_trade_subscription_states
      WHERE subscriptionId = ${subscriptionId}
      LIMIT 1
      ${lockSql}
    `);

    const state = rows[0];

    if (!state) {
      throw new NotFoundException(
        'Internal trading subscription state was not found.',
      );
    }

    return state;
  }

  private principalResultAmount(
    principal: DecimalValue,
    resultPercent: DecimalValue,
  ): string {
    return new Prisma.Decimal(principal)
      .mul(new Prisma.Decimal(resultPercent))
      .div(100)
      .toDecimalPlaces(8, 4)
      .toFixed(8);
  }

  private async postSettlement(
    transaction: Prisma.TransactionClient,
    input: {
      eventId: string;
      sourceKey: string;
      subscriptionId: string;
      userId: string;
      packageCode: string;
      currency: string;
      grossSettlementAmount: string;
      userShareAmount: string;
      adminShareAmount: string;
    },
    actor: AuthenticatedUser | null,
    context: RequestContext,
  ): Promise<string> {
    const gross = new Prisma.Decimal(input.grossSettlementAmount);
    const user = new Prisma.Decimal(input.userShareAmount);
    const admin = new Prisma.Decimal(input.adminShareAmount);

    if (
      gross.lte(0) ||
      user.lt(0) ||
      admin.lt(0) ||
      !user.add(admin).eq(gross)
    ) {
      throw new ServiceUnavailableException(
        'Internal trading settlement split is not balanced.',
      );
    }

    const currency = input.currency.toUpperCase();

    const expenseAccount = await this.ensureAccount(transaction, {
      accountKey: `SYSTEM:INTERNAL_TRADING_RETURN_EXPENSE:${currency}`,
      ownerType: 'SYSTEM',
      ownerUserId: null,
      bucket: 'INTERNAL_TRADING_RETURN_EXPENSE',
      currency,
      normalSide: 'DEBIT',
    });

    const userAccount = await this.ensureAccount(transaction, {
      accountKey: `USER:${input.userId}:PACKAGE_EARNINGS:${currency}`,
      ownerType: 'USER',
      ownerUserId: input.userId,
      bucket: 'PACKAGE_EARNINGS',
      currency,
      normalSide: 'CREDIT',
    });

    const adminAccount = await this.ensureAccount(transaction, {
      accountKey: `SYSTEM:INTERNAL_TRADING_ADMIN_PROFIT:${currency}`,
      ownerType: 'SYSTEM',
      ownerUserId: null,
      bucket: 'INTERNAL_TRADING_ADMIN_PROFIT',
      currency,
      normalSide: 'CREDIT',
    });

    const ledgerTransactionId = randomUUID();
    const ledgerSourceKey = `${input.sourceKey}:SETTLEMENT`;

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_transactions (
        id,
        kind,
        sourceKey,
        sourceType,
        sourceId,
        currency,
        postedByUserId,
        description,
        metadata,
        postedAt,
        createdAt
      ) VALUES (
        ${ledgerTransactionId},
        'INTERNAL_TRADING_SETTLEMENT',
        ${ledgerSourceKey},
        'INTERNAL_TRADE_EVENT',
        ${input.eventId},
        ${currency},
        ${actor?.id ?? null},
        ${`Internal trading WIN settlement for ` + `${input.subscriptionId}.`},
        ${JSON.stringify({
          subscriptionId: input.subscriptionId,
          eventId: input.eventId,
          packageCode: input.packageCode,
          grossSettlementAmount: input.grossSettlementAmount,
          userShareAmount: input.userShareAmount,
          adminShareAmount: input.adminShareAmount,
          highWaterSettlement: false,
          settlementMode: 'WIN_IMMEDIATE',
          highWaterTracking: true,
          resultBasis: 'PACKAGE_PRINCIPAL',
        })},
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      )
    `);

    await this.insertEntry(
      transaction,
      ledgerTransactionId,
      expenseAccount.id,
      'DEBIT',
      input.grossSettlementAmount,
      `Internal trading gross return expense for ${input.eventId}.`,
    );

    if (user.gt(0)) {
      await this.insertEntry(
        transaction,
        ledgerTransactionId,
        userAccount.id,
        'CREDIT',
        input.userShareAmount,
        `Package earnings credit for internal trade ${input.eventId}.`,
      );
    }

    if (admin.gt(0)) {
      await this.insertEntry(
        transaction,
        ledgerTransactionId,
        adminAccount.id,
        'CREDIT',
        input.adminShareAmount,
        `Admin internal trading profit for ${input.eventId}.`,
      );
    }

    await this.applyBalance(
      transaction,
      expenseAccount,
      'DEBIT',
      input.grossSettlementAmount,
    );

    if (user.gt(0)) {
      await this.applyBalance(
        transaction,
        userAccount,
        'CREDIT',
        input.userShareAmount,
      );
    }

    if (admin.gt(0)) {
      await this.applyBalance(
        transaction,
        adminAccount,
        'CREDIT',
        input.adminShareAmount,
      );
    }

    const sideRows = await transaction.$queryRaw<BalanceSideRow[]>(Prisma.sql`
      SELECT side, SUM(amount) AS total
      FROM ledger_entries
      WHERE transactionId = ${ledgerTransactionId}
      GROUP BY side
    `);

    const debit = sideRows.find((row) => row.side === 'DEBIT');

    const credit = sideRows.find((row) => row.side === 'CREDIT');

    if (
      !debit ||
      !credit ||
      !new Prisma.Decimal(debit.total).eq(new Prisma.Decimal(credit.total))
    ) {
      throw new ServiceUnavailableException(
        'Internal trading ledger transaction is not balanced.',
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        action: 'CREATE',
        entityType: 'LedgerTransaction',
        entityId: ledgerTransactionId,
        description:
          'Internal trading high-water settlement posted to immutable ledger.',
        metadata: {
          source: 'INTERNAL_TRADING',
          operation: 'POST_HIGH_WATER_SETTLEMENT',
          sourceKey: ledgerSourceKey,
          subscriptionId: input.subscriptionId,
          eventId: input.eventId,
          grossSettlementAmount: input.grossSettlementAmount,
          userShareAmount: input.userShareAmount,
          adminShareAmount: input.adminShareAmount,
          currency,
          balanced: true,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return ledgerTransactionId;
  }

  private async ensureAccount(
    transaction: Prisma.TransactionClient,
    input: Omit<AccountRow, 'id'>,
  ): Promise<AccountRow> {
    const id = randomUUID();

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id,
        accountKey,
        ownerType,
        ownerUserId,
        bucket,
        currency,
        normalSide,
        createdAt
      ) VALUES (
        ${id},
        ${input.accountKey},
        ${input.ownerType},
        ${input.ownerUserId},
        ${input.bucket},
        ${input.currency},
        ${input.normalSide},
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE
        accountKey = VALUES(accountKey)
    `);

    const rows = await transaction.$queryRaw<AccountRow[]>(Prisma.sql`
      SELECT
        id,
        accountKey,
        ownerType,
        ownerUserId,
        bucket,
        currency,
        normalSide
      FROM ledger_accounts
      WHERE accountKey = ${input.accountKey}
      LIMIT 1
      FOR UPDATE
    `);

    const account = rows[0];

    if (!account) {
      throw new ServiceUnavailableException(
        'Internal trading ledger account could not be established.',
      );
    }

    if (
      account.ownerType !== input.ownerType ||
      account.ownerUserId !== input.ownerUserId ||
      account.bucket !== input.bucket ||
      account.currency !== input.currency ||
      account.normalSide !== input.normalSide
    ) {
      throw new ServiceUnavailableException(
        'Internal trading ledger account semantics conflict with an existing account.',
      );
    }

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_account_balances (
        accountId,
        balance,
        revision,
        updatedAt
      ) VALUES (
        ${account.id},
        0.00000000,
        0,
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE
        accountId = VALUES(accountId)
    `);

    return account;
  }

  private async insertEntry(
    transaction: Prisma.TransactionClient,
    transactionId: string,
    accountId: string,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
    memo: string,
  ) {
    if (new Prisma.Decimal(amount).lte(0)) {
      throw new ServiceUnavailableException(
        'Ledger entry amount must be positive.',
      );
    }

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id,
        transactionId,
        accountId,
        side,
        amount,
        memo,
        createdAt
      ) VALUES (
        ${randomUUID()},
        ${transactionId},
        ${accountId},
        ${side},
        ${amount},
        ${memo},
        CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async applyBalance(
    transaction: Prisma.TransactionClient,
    account: AccountRow,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
  ) {
    const direction = side === account.normalSide ? 1 : -1;

    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE ledger_account_balances
      SET
        balance = balance + (
          ${direction} *
          CAST(${amount} AS DECIMAL(20, 8))
        ),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (
          ${direction} *
          CAST(${amount} AS DECIMAL(20, 8))
        ) >= 0
    `);

    if (updated !== 1) {
      throw new ConflictException(
        `Ledger balance update rejected for ${account.accountKey}.`,
      );
    }
  }

  private stateSnapshot(row: StateRow) {
    return {
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      username: row.username,
      email: row.email,
      splitPolicyVersionId: row.splitPolicyVersionId,
      packagePlanVersionId: row.packagePlanVersionId,
      packagePlanItemId: row.packagePlanItemId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      currency: row.currency,
      principalAmount: this.moneyString(row.principalAmount),
      grossMultiplier: new Prisma.Decimal(row.grossMultiplier).toFixed(4),
      grossTarget: this.moneyString(row.grossTarget),
      userSharePercent: this.rateString(row.userSharePercent),
      adminSharePercent: this.rateString(row.adminSharePercent),
      timezoneSnapshot: row.timezoneSnapshot,
      activationLocalDate: this.localDateString(row.activationLocalDate),
      finalLocalDate: this.localDateString(row.finalLocalDate),
      grossNetProgress: this.moneyString(row.grossNetProgress),
      grossHighWaterMark: this.moneyString(row.grossHighWaterMark),
      userCreditedAmount: this.moneyString(row.userCreditedAmount),
      adminRecognizedAmount: this.moneyString(row.adminRecognizedAmount),
      nextTradeLocalDate: this.localDateString(row.nextTradeLocalDate),
      settledTradeCount: Number(row.settledTradeCount),
      status: row.status,
      completionReason: row.completionReason,
      blockedReason: row.blockedReason,
      revision: row.revision,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private userStateSnapshot(row: StateRow) {
    return {
      subscriptionId: row.subscriptionId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      currency: row.currency,
      principalAmount: this.moneyString(row.principalAmount),
      grossMultiplier: new Prisma.Decimal(row.grossMultiplier).toFixed(4),
      grossTarget: this.moneyString(row.grossTarget),
      userSharePercent: this.rateString(row.userSharePercent),
      timezoneSnapshot: row.timezoneSnapshot,
      activationLocalDate: this.localDateString(row.activationLocalDate),
      finalLocalDate: this.localDateString(row.finalLocalDate),
      grossNetProgress: this.moneyString(row.grossNetProgress),
      grossHighWaterMark: this.moneyString(row.grossHighWaterMark),
      userCreditedAmount: this.moneyString(row.userCreditedAmount),
      nextTradeLocalDate: this.localDateString(row.nextTradeLocalDate),
      settledTradeCount: Number(row.settledTradeCount),
      status: row.status,
      completionReason: row.completionReason,
      blockedReason: row.blockedReason,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private userEventSnapshot(row: EventRow) {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      currency: row.currency,
      grossTarget: this.moneyString(row.grossTarget),
      localTradeDate: this.localDateString(row.localTradeDate),
      tradeDayNumber: row.tradeDayNumber,
      slotNumber: row.slotNumber,
      scheduledAt: row.scheduledAt,
      timezoneSnapshot: row.timezoneSnapshot,
      assetSymbol: row.assetSymbol,
      outcome: row.outcome,
      eventType: row.eventType,
      resultPercent: new Prisma.Decimal(row.resultPercent).toFixed(6),
      grossResultAmount: this.moneyString(row.grossResultAmount),
      grossProgressBefore: this.moneyString(row.grossProgressBefore),
      grossProgressAfter: this.moneyString(row.grossProgressAfter),
      grossHighWaterBefore: this.moneyString(row.grossHighWaterBefore),
      grossHighWaterAfter: this.moneyString(row.grossHighWaterAfter),
      settlementMode: row.settlementMode ?? 'HIGH_WATER',
      grossSettlementAmount: this.moneyString(row.grossSettlementAmount),
      userShareAmount: this.moneyString(row.userShareAmount),
      generationSource: row.generationSource,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
    };
  }

  private eventSnapshot(row: EventRow) {
    return {
      id: row.id,
      sourceKey: row.sourceKey,
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      policyVersionId: row.policyVersionId,
      packagePlanVersionId: row.packagePlanVersionId,
      packagePlanItemId: row.packagePlanItemId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      currency: row.currency,
      grossTarget: this.moneyString(row.grossTarget),
      localTradeDate: this.localDateString(row.localTradeDate),
      tradeDayNumber: row.tradeDayNumber,
      slotNumber: row.slotNumber,
      scheduledAt: row.scheduledAt,
      timezoneSnapshot: row.timezoneSnapshot,
      assetSymbol: row.assetSymbol,
      outcome: row.outcome,
      eventType: row.eventType,
      resultPercent: new Prisma.Decimal(row.resultPercent).toFixed(6),
      grossResultAmount: this.moneyString(row.grossResultAmount),
      grossProgressBefore: this.moneyString(row.grossProgressBefore),
      grossProgressAfter: this.moneyString(row.grossProgressAfter),
      grossHighWaterBefore: this.moneyString(row.grossHighWaterBefore),
      grossHighWaterAfter: this.moneyString(row.grossHighWaterAfter),
      settlementMode: row.settlementMode ?? 'HIGH_WATER',
      grossSettlementAmount: this.moneyString(row.grossSettlementAmount),
      userShareAmount: this.moneyString(row.userShareAmount),
      adminShareAmount: this.moneyString(row.adminShareAmount),
      ledgerTransactionId: row.ledgerTransactionId,
      generationSource: row.generationSource,
      generatedByUserId: row.generatedByUserId,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
    };
  }

  private tradeSourceKey(
    subscriptionId: string,
    localTradeDate: string,
    slotNumber: number,
  ) {
    return (
      `SUBSCRIPTION:${subscriptionId}:` +
      `INTERNAL_TRADE:${localTradeDate}:` +
      `SLOT:${slotNumber}`
    );
  }

  private stringArray(value: unknown): string[] {
    const parsed = this.jsonValue(value);

    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (entry) => typeof entry !== 'string' || entry.trim().length === 0,
      )
    ) {
      throw new ServiceUnavailableException(
        'Internal trading asset configuration is invalid.',
      );
    }

    return parsed.map((entry) => String(entry).trim().toUpperCase());
  }

  private timingWindows(value: unknown) {
    const parsed = this.jsonValue(value);

    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        'Internal trading timing configuration is invalid.',
      );
    }

    return parsed.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ServiceUnavailableException(
          'Internal trading timing window is invalid.',
        );
      }

      const candidate = entry as Record<string, unknown>;
      const start = candidate.start;
      const end = candidate.end;

      if (typeof start !== 'string' || typeof end !== 'string') {
        throw new ServiceUnavailableException(
          'Internal trading timing window is invalid.',
        );
      }

      return {
        start,
        end,
      };
    });
  }

  private jsonValue(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      throw new ServiceUnavailableException(
        'Internal trading JSON configuration is invalid.',
      );
    }
  }

  private moneyString(value: DecimalValue): string {
    return new Prisma.Decimal(value).toDecimalPlaces(8, 4).toFixed(8);
  }

  private rateString(value: DecimalValue): string {
    return new Prisma.Decimal(value).toDecimalPlaces(6, 4).toFixed(6);
  }

  private countNumber(
    value: bigint | number | string | DecimalValue | undefined,
  ): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      return Number.parseInt(value, 10) || 0;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    return 0;
  }

  private localDateString(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }

    return value.toISOString().slice(0, 10);
  }

  private localDateInTimezone(value: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(value);

    const year = parts.find((part) => part.type === 'year')?.value;

    const month = parts.find((part) => part.type === 'month')?.value;

    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new ServiceUnavailableException(
        'Internal trading local date could not be resolved.',
      );
    }

    return `${year}-${month}-${day}`;
  }

  private addLocalDays(localDate: string, days: number): string {
    const date = new Date(`${localDate}T00:00:00.000Z`);

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  }

  private daysBetween(startLocalDate: string, endLocalDate: string): number {
    const start = Date.parse(`${startLocalDate}T00:00:00.000Z`);

    const end = Date.parse(`${endLocalDate}T00:00:00.000Z`);

    return Math.floor((end - start) / 86_400_000);
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        lastError = error;

        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';

        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
      }
    }

    throw lastError;
  }
}
