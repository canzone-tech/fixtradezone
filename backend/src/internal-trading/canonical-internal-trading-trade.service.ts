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
import {
  calculateNormalTradeTransition,
  calculateTargetReconciliationTransition,
} from './internal-trading-calculation';
import {
  addLocalDays,
  grossTargetForUserNet,
  packageUserNetAmount,
  packageUserNetRateForDate,
} from './internal-trading-package-earnings';
import { InternalTradingTradeService } from './internal-trading-trade.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_RECONCILE_DAYS = 1500;

type DecimalValue = Prisma.Decimal | number | string;

interface LegacyProbeRow {
  localTradeDate: string | Date;
  total: bigint | number | string;
  linked: bigint | number | string | null;
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
}

interface PackageEarningTermsRow {
  rewardRateMode: 'FIXED' | 'RANDOM_RANGE' | 'MANUAL' | 'RULE_BASED';
  fixedRewardRate: DecimalValue | null;
  minimumRewardRate: DecimalValue | null;
  maximumRewardRate: DecimalValue | null;
  rewardRateMeaning: string;
  goalDays: number;
}

interface ExistingSlotRow {
  slotNumber: number;
  userShareAmount: DecimalValue;
  simulatedActivityEventId: string | null;
}

interface CanonicalDailyTradeRow {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  userId: string;
  policyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  localActivityDate: string | Date;
  slotNumber: number;
  scheduledAt: Date;
  timezoneSnapshot: string;
  assetSymbol: string;
  outcome: 'WIN' | 'LOSS';
  resultPercent: DecimalValue;
  activitiesPerDay: number;
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

/**
 * Forward-only canonical reconciliation facade.
 *
 * Daily Trade owns schedule, asset, WIN/LOSS and raw result percentage.
 * Internal Trading consumes that immutable event and only applies the package
 * financial interpretation.  Existing read/admin APIs delegate to the proven
 * legacy service; only reconciliation is replaced.
 */
@Injectable()
export class CanonicalInternalTradingTradeService {
  private readonly legacyTradeService: InternalTradingTradeService;

  constructor(private readonly canonicalPrisma: PrismaService) {
    this.legacyTradeService = new InternalTradingTradeService(canonicalPrisma);
  }

  listAdminWorkspace(
    ...args: Parameters<InternalTradingTradeService['listAdminWorkspace']>
  ) {
    return this.legacyTradeService.listAdminWorkspace(...args);
  }

  getAdminState(
    ...args: Parameters<InternalTradingTradeService['getAdminState']>
  ) {
    return this.legacyTradeService.getAdminState(...args);
  }

  getMyPackages(
    ...args: Parameters<InternalTradingTradeService['getMyPackages']>
  ) {
    return this.legacyTradeService.getMyPackages(...args);
  }

  getMyPackage(...args: Parameters<InternalTradingTradeService['getMyPackage']>) {
    return this.legacyTradeService.getMyPackage(...args);
  }

  listAdminEvents(
    ...args: Parameters<InternalTradingTradeService['listAdminEvents']>
  ) {
    return this.legacyTradeService.listAdminEvents(...args);
  }

  listMyEvents(
    ...args: Parameters<InternalTradingTradeService['listMyEvents']>
  ) {
    return this.legacyTradeService.listMyEvents(...args);
  }

  listWorkerCandidates(
    ...args: Parameters<InternalTradingTradeService['listWorkerCandidates']>
  ) {
    return this.legacyTradeService.listWorkerCandidates(...args);
  }

  async reconcileSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser | null,
    context: RequestContext = {},
    generationSource: 'WORKER' | 'RECONCILIATION' = 'RECONCILIATION',
  ) {
    if (await this.requiresLegacyContinuation(subscriptionId)) {
      return this.legacyTradeService.reconcileSubscription(
        subscriptionId,
        actor,
        context,
        generationSource,
      );
    }

    return this.reconcileCanonicalSubscription(
      subscriptionId,
      actor,
      context,
      generationSource,
    );
  }

  private async requiresLegacyContinuation(subscriptionId: string) {
    const rows = await this.canonicalPrisma.$queryRaw<LegacyProbeRow[]>(
      Prisma.sql`
        SELECT
          s.nextTradeLocalDate AS localTradeDate,
          COUNT(e.id) AS total,
          COALESCE(
            SUM(CASE WHEN e.simulatedActivityEventId IS NOT NULL THEN 1 ELSE 0 END),
            0
          ) AS linked
        FROM internal_trade_subscription_states s
        LEFT JOIN internal_trade_events e
          ON e.subscriptionId = s.subscriptionId
          AND e.localTradeDate = s.nextTradeLocalDate
        WHERE s.subscriptionId = ${subscriptionId}
        GROUP BY s.subscriptionId, s.nextTradeLocalDate
        LIMIT 1
      `,
    );

    const row = rows[0];
    if (!row) return false;

    const total = this.countNumber(row.total);
    const linked = this.countNumber(row.linked ?? 0);

    if (total === 0 || linked === total) return false;
    if (linked === 0) return true;

    throw new ServiceUnavailableException(
      `Internal trading day ${this.localDateString(
        row.localTradeDate,
      )} contains mixed legacy and canonical events.`,
    );
  }

  private async reconcileCanonicalSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser | null,
    context: RequestContext,
    generationSource: 'WORKER' | 'RECONCILIATION',
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

      const earningTerms = await this.requirePackageEarningTerms(
        transaction,
        subscriptionId,
      );
      const expectedFirstEarningLocalDate = addLocalDays(
        this.localDateString(state.activationLocalDate),
        1,
      );
      const expectedFinalEarningLocalDate = addLocalDays(
        this.localDateString(state.activationLocalDate),
        earningTerms.goalDays,
      );

      if (
        this.localDateString(state.finalLocalDate) !==
          expectedFinalEarningLocalDate ||
        this.localDateString(state.nextTradeLocalDate) <
          expectedFirstEarningLocalDate
      ) {
        throw new ServiceUnavailableException(
          'Internal trading lifecycle date snapshot does not match the package earning duration contract.',
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
          message: 'No canonical Daily Trades are due.',
          createdEvents: 0,
          createdSettlements: 0,
          state: this.stateSnapshot(state),
        };
      }

      let createdEvents = 0;
      let createdSettlements = 0;
      const createdEventIds: string[] = [];
      const consumedDailyTradeIds: string[] = [];

      for (
        let dayGuard = 0;
        dayGuard < MAX_RECONCILE_DAYS && nextTradeLocalDate <= throughLocalDate;
        dayGuard += 1
      ) {
        const localTradeDate = nextTradeLocalDate;
        const existingSlots = await transaction.$queryRaw<ExistingSlotRow[]>(
          Prisma.sql`
            SELECT
              slotNumber,
              userShareAmount,
              simulatedActivityEventId
            FROM internal_trade_events
            WHERE subscriptionId = ${state.subscriptionId}
              AND localTradeDate = ${localTradeDate}
            ORDER BY slotNumber ASC
            FOR UPDATE
          `,
        );

        existingSlots.forEach((row, index) => {
          if (row.slotNumber !== index + 1) {
            throw new ServiceUnavailableException(
              'Internal trading event slots are not contiguous.',
            );
          }
          if (!row.simulatedActivityEventId) {
            throw new ServiceUnavailableException(
              'Legacy internal trading rows appeared during canonical reconciliation; retry this subscription.',
            );
          }
        });

        const canonicalEvents =
          await transaction.$queryRaw<CanonicalDailyTradeRow[]>(Prisma.sql`
            SELECT
              e.id,
              e.sourceKey,
              e.subscriptionId,
              e.userId,
              e.policyVersionId,
              e.packagePlanVersionId,
              e.packagePlanItemId,
              e.packageCode,
              e.packageDisplayName,
              e.localActivityDate,
              e.slotNumber,
              e.scheduledAt,
              e.timezoneSnapshot,
              e.assetSymbol,
              e.outcome,
              e.resultPercent,
              p.activitiesPerDay
            FROM simulated_trade_activity_events e
            INNER JOIN simulated_activity_policy_versions p
              ON p.id = e.policyVersionId
            WHERE e.subscriptionId = ${state.subscriptionId}
              AND e.localActivityDate = ${localTradeDate}
            ORDER BY e.slotNumber ASC, e.createdAt ASC
            FOR SHARE
          `);

        if (canonicalEvents.length === 0) break;

        const activitiesPerDay = canonicalEvents[0].activitiesPerDay;
        if (!Number.isInteger(activitiesPerDay) || activitiesPerDay < 1) {
          throw new ServiceUnavailableException(
            'Canonical Daily Trade policy has an invalid daily activity count.',
          );
        }

        canonicalEvents.forEach((event, index) => {
          if (event.activitiesPerDay !== activitiesPerDay) {
            throw new ServiceUnavailableException(
              'Canonical Daily Trade day contains mixed policy activity counts.',
            );
          }
          if (event.slotNumber !== index + 1) {
            throw new ServiceUnavailableException(
              'Canonical Daily Trade slots are not contiguous.',
            );
          }
          this.assertCanonicalEventMatchesState(event, state, localTradeDate);
        });

        if (canonicalEvents.length > activitiesPerDay) {
          throw new ServiceUnavailableException(
            'Canonical Daily Trade count exceeds its effective daily policy.',
          );
        }
        if (existingSlots.length > canonicalEvents.length) {
          throw new ServiceUnavailableException(
            'Internal Trading contains more slots than the canonical Daily Trade source.',
          );
        }

        existingSlots.forEach((row, index) => {
          if (row.simulatedActivityEventId !== canonicalEvents[index].id) {
            throw new ServiceUnavailableException(
              'Internal Trading is not linked to the matching canonical Daily Trade slot.',
            );
          }
        });

        const tradeDayNumber =
          this.daysBetween(expectedFirstEarningLocalDate, localTradeDate) + 1;
        if (tradeDayNumber < 1 || tradeDayNumber > earningTerms.goalDays) {
          throw new ServiceUnavailableException(
            'Internal trading trade day is outside the package earning duration.',
          );
        }

        const packageUserNetRate = packageUserNetRateForDate(
          state.subscriptionId,
          localTradeDate,
          earningTerms,
        );
        const dailyUserNetTarget = packageUserNetAmount(
          state.principalAmount,
          packageUserNetRate,
        );
        const alreadyCreditedToday = existingSlots
          .reduce(
            (total, row) => total.add(new Prisma.Decimal(row.userShareAmount)),
            new Prisma.Decimal(0),
          )
          .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
        const userCreditedBeforeDay = new Prisma.Decimal(
          state.userCreditedAmount,
        )
          .sub(alreadyCreditedToday)
          .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);

        if (userCreditedBeforeDay.lt(0)) {
          throw new ServiceUnavailableException(
            'Internal trading daily USER credit baseline is invalid.',
          );
        }

        const desiredUserCreditThroughDay = userCreditedBeforeDay
          .add(dailyUserNetTarget)
          .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
        const dailyGrossTarget = grossTargetForUserNet(
          desiredUserCreditThroughDay,
          state.userSharePercent,
        );

        if (dailyGrossTarget.gt(new Prisma.Decimal(state.grossTarget))) {
          throw new ServiceUnavailableException(
            'Daily internal trading gross target exceeds the immutable package lifetime target.',
          );
        }

        let completedDay =
          existingSlots.length === activitiesPerDay &&
          canonicalEvents.length === activitiesPerDay;

        for (
          let slotNumber = existingSlots.length + 1;
          slotNumber <= canonicalEvents.length;
          slotNumber += 1
        ) {
          const canonical = canonicalEvents[slotNumber - 1];
          if (canonical.scheduledAt.getTime() > now.getTime()) {
            completedDay = false;
            break;
          }

          const rawGrossResultAmount = this.principalResultAmount(
            state.principalAmount,
            canonical.resultPercent,
          );
          if (new Prisma.Decimal(rawGrossResultAmount).eq(0)) {
            throw new ServiceUnavailableException(
              'Canonical Daily Trade result rounded to zero for financial processing.',
            );
          }

          const financialSnapshot = {
            grossTarget: dailyGrossTarget,
            grossProgressBefore: state.grossNetProgress,
            grossHighWaterBefore: state.grossHighWaterMark,
            userSharePercent: state.userSharePercent,
            adminSharePercent: state.adminSharePercent,
            userCreditedBefore: state.userCreditedAmount,
            adminRecognizedBefore: state.adminRecognizedAmount,
          };
          const dailyReconciliationSlot =
            canonicalEvents.length === activitiesPerDay &&
            slotNumber === activitiesPerDay;
          const transition = dailyReconciliationSlot
            ? calculateTargetReconciliationTransition(financialSnapshot)
            : calculateNormalTradeTransition(
                financialSnapshot,
                rawGrossResultAmount,
              );
          const financialAdjustmentAmount = new Prisma.Decimal(
            transition.grossResultAmount,
          )
            .sub(rawGrossResultAmount)
            .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
            .toFixed(8);
          const sourceKey = this.canonicalSourceKey(canonical.id);
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
                  localTradeDate,
                  packageUserNetRate: packageUserNetRate.toFixed(6),
                  dailyUserNetTarget: dailyUserNetTarget.toFixed(8),
                  dailyGrossTarget: dailyGrossTarget.toFixed(8),
                  grossSettlementAmount: transition.grossSettlementAmount,
                  userShareAmount: transition.userSettlementAmount,
                  adminShareAmount: transition.adminSettlementAmount,
                  simulatedActivityEventId: canonical.id,
                },
                actor,
                context,
              )
            : null;

          if (ledgerTransactionId) createdSettlements += 1;

          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO internal_trade_events (
              id,
              sourceKey,
              simulatedActivityEventId,
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
              financialAdjustmentAmount,
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
              ${canonical.id},
              ${state.subscriptionId},
              ${state.userId},
              ${state.splitPolicyVersionId},
              ${state.packagePlanVersionId},
              ${state.packagePlanItemId},
              ${state.packageCode},
              ${state.packageDisplayName},
              ${state.currency},
              ${this.moneyString(state.grossTarget)},
              ${localTradeDate},
              ${tradeDayNumber},
              ${slotNumber},
              ${canonical.scheduledAt},
              ${canonical.timezoneSnapshot},
              ${canonical.assetSymbol},
              ${canonical.outcome},
              ${transition.eventType},
              ${this.rateString(canonical.resultPercent)},
              ${rawGrossResultAmount},
              ${financialAdjustmentAmount},
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

          const completing =
            localTradeDate === finalLocalDate &&
            dailyReconciliationSlot &&
            transition.reachedGrossTarget;
          const updated = await transaction.$executeRaw(Prisma.sql`
            UPDATE internal_trade_subscription_states
            SET
              grossNetProgress = ${transition.grossProgressAfter},
              grossHighWaterMark = ${transition.grossHighWaterAfter},
              userCreditedAmount = ${transition.userCreditedAfter},
              adminRecognizedAmount = ${transition.adminRecognizedAfter},
              settledTradeCount = settledTradeCount + 1,
              status = ${completing ? 'COMPLETED' : 'ACTIVE'},
              completionReason = ${
                completing ? 'TARGET_REACHED_AT_DURATION_END' : null
              },
              completedAt = ${completing ? now : null},
              revision = revision + 1,
              updatedAt = CURRENT_TIMESTAMP(3)
            WHERE subscriptionId = ${state.subscriptionId}
              AND revision = ${state.revision}
          `);

          if (updated !== 1) {
            throw new ConflictException(
              'Internal trading state changed during canonical reconciliation.',
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
          consumedDailyTradeIds.push(canonical.id);

          if (completing) {
            completedDay = true;
            break;
          }
          completedDay =
            slotNumber === activitiesPerDay &&
            canonicalEvents.length === activitiesPerDay;
        }

        if (state.status === 'COMPLETED') break;
        if (!completedDay) break;

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
            'Internal trading state changed while advancing its canonical trading day.',
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
            description:
              'Internal Trading consumed canonical Daily Trade events and applied package financial settlement.',
            metadata: {
              source: 'INTERNAL_TRADING',
              operation: 'RECONCILE_CANONICAL_DAILY_TRADES',
              canonicalSource: 'SIMULATED_TRADE_ACTIVITY',
              subscriptionId: state.subscriptionId,
              createdEvents,
              createdSettlements,
              eventIds: createdEventIds,
              dailyTradeEventIds: consumedDailyTradeIds,
              financialModel: 'GROSS_BEFORE_SPLIT',
              earningTargetBasis: 'PACKAGE_USER_NET_DAILY_RATE',
              packageRewardRateMode: earningTerms.rewardRateMode,
              packageRewardRateMeaning: earningTerms.rewardRateMeaning,
              resultBasis: 'CANONICAL_DAILY_TRADE_RAW_RESULT',
              settlementMode: 'WIN_IMMEDIATE',
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }

      return {
        message:
          createdEvents > 0
            ? 'Canonical Daily Trades financially reconciled.'
            : 'No canonical Daily Trades were due.',
        createdEvents,
        createdSettlements,
        eventIds: createdEventIds,
        dailyTradeEventIds: consumedDailyTradeIds,
        state: this.stateSnapshot(state),
      };
    });
  }

  private assertCanonicalEventMatchesState(
    event: CanonicalDailyTradeRow,
    state: StateRow,
    localTradeDate: string,
  ) {
    if (
      event.subscriptionId !== state.subscriptionId ||
      event.userId !== state.userId ||
      event.packagePlanVersionId !== state.packagePlanVersionId ||
      event.packagePlanItemId !== state.packagePlanItemId ||
      event.packageCode !== state.packageCode ||
      this.localDateString(event.localActivityDate) !== localTradeDate ||
      event.timezoneSnapshot !== state.timezoneSnapshot
    ) {
      throw new ServiceUnavailableException(
        'Canonical Daily Trade snapshot does not match the internal trading package snapshot.',
      );
    }
  }

  private async requireState(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    lock: boolean,
  ): Promise<StateRow> {
    const lockSql = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<StateRow[]>(Prisma.sql`
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

  private async requirePackageEarningTerms(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
  ): Promise<PackageEarningTermsRow> {
    const rows = await transaction.$queryRaw<PackageEarningTermsRow[]>(
      Prisma.sql`
        SELECT
          rewardRateMode,
          fixedRewardRate,
          minimumRewardRate,
          maximumRewardRate,
          rewardRateMeaning,
          goalDays
        FROM user_package_subscriptions
        WHERE id = ${subscriptionId}
          AND status = 'ACTIVE'
          AND earningAuthority = 'INTERNAL_TRADING'
        LIMIT 1
        FOR SHARE
      `,
    );
    const terms = rows[0];

    if (!terms) {
      throw new ServiceUnavailableException(
        'Immutable package earning terms are unavailable for internal trading.',
      );
    }
    return terms;
  }

  private principalResultAmount(
    principal: DecimalValue,
    resultPercent: DecimalValue,
  ): string {
    return new Prisma.Decimal(principal)
      .mul(new Prisma.Decimal(resultPercent))
      .div(100)
      .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(8);
  }

  private canonicalSourceKey(simulatedActivityEventId: string) {
    return `CANONICAL_DAILY_TRADE:${simulatedActivityEventId}:INTERNAL_TRADING`;
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
      localTradeDate: string;
      packageUserNetRate: string;
      dailyUserNetTarget: string;
      dailyGrossTarget: string;
      grossSettlementAmount: string;
      userShareAmount: string;
      adminShareAmount: string;
      simulatedActivityEventId: string;
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
        id, kind, sourceKey, sourceType, sourceId, currency,
        postedByUserId, description, metadata, postedAt, createdAt
      ) VALUES (
        ${ledgerTransactionId},
        'INTERNAL_TRADING_SETTLEMENT',
        ${ledgerSourceKey},
        'INTERNAL_TRADE_EVENT',
        ${input.eventId},
        ${currency},
        ${actor?.id ?? null},
        ${`Internal trading canonical Daily Trade settlement for ${input.subscriptionId}.`},
        ${JSON.stringify({
          subscriptionId: input.subscriptionId,
          eventId: input.eventId,
          simulatedActivityEventId: input.simulatedActivityEventId,
          canonicalSource: 'SIMULATED_TRADE_ACTIVITY',
          packageCode: input.packageCode,
          localTradeDate: input.localTradeDate,
          earningTargetBasis: 'PACKAGE_USER_NET_DAILY_RATE',
          packageUserNetRate: input.packageUserNetRate,
          dailyUserNetTarget: input.dailyUserNetTarget,
          dailyGrossTarget: input.dailyGrossTarget,
          grossSettlementAmount: input.grossSettlementAmount,
          userShareAmount: input.userShareAmount,
          adminShareAmount: input.adminShareAmount,
          settlementMode: 'WIN_IMMEDIATE',
          resultBasis: 'CANONICAL_DAILY_TRADE_RAW_RESULT',
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
          'Canonical Daily Trade package settlement posted to immutable ledger.',
        metadata: {
          source: 'INTERNAL_TRADING',
          operation: 'POST_CANONICAL_DAILY_TRADE_SETTLEMENT',
          canonicalSource: 'SIMULATED_TRADE_ACTIVITY',
          sourceKey: ledgerSourceKey,
          subscriptionId: input.subscriptionId,
          eventId: input.eventId,
          simulatedActivityEventId: input.simulatedActivityEventId,
          localTradeDate: input.localTradeDate,
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
        id, accountKey, ownerType, ownerUserId, bucket, currency,
        normalSide, createdAt
      ) VALUES (
        ${id}, ${input.accountKey}, ${input.ownerType}, ${input.ownerUserId},
        ${input.bucket}, ${input.currency}, ${input.normalSide},
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);

    const rows = await transaction.$queryRaw<AccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
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
        accountId, balance, revision, updatedAt
      ) VALUES (
        ${account.id}, 0.00000000, 0, CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountId = VALUES(accountId)
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
        id, transactionId, accountId, side, amount, memo, createdAt
      ) VALUES (
        ${randomUUID()}, ${transactionId}, ${accountId}, ${side}, ${amount},
        ${memo}, CURRENT_TIMESTAMP(3)
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
        balance = balance + (${direction} * CAST(${amount} AS DECIMAL(20, 8))),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (${direction} * CAST(${amount} AS DECIMAL(20, 8))) >= 0
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

  private moneyString(value: DecimalValue): string {
    return new Prisma.Decimal(value)
      .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(8);
  }

  private rateString(value: DecimalValue): string {
    return new Prisma.Decimal(value)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(6);
  }

  private countNumber(
    value: bigint | number | string | DecimalValue | null | undefined,
  ): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
    if (value instanceof Prisma.Decimal) return value.toNumber();
    return 0;
  }

  private localDateString(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
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
        return await this.canonicalPrisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
      }
    }
    throw lastError;
  }
}
