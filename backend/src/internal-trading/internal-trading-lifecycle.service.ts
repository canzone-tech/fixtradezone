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
import type { AdminInternalTradingStateQueryDto } from './dto/internal-trading-lifecycle.dto';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type DecimalValue = Prisma.Decimal | string | number;
type EarningAuthority = 'LEGACY_REWARD' | 'INTERNAL_TRADING';

interface SubscriptionLifecycleRow {
  id: string;
  userId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  price: DecimalValue;
  currency: string;
  settlementTimezone: string;
  capMultiplier: DecimalValue;
  goalDays: number;
  earningAuthority: EarningAuthority;
  internalTradeSplitPolicyVersionId: string | null;
  internalTradeUserSharePercent: DecimalValue | null;
  internalTradeAdminSharePercent: DecimalValue | null;
  activatedAt: Date;
  scheduledEndAt: Date;
  status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
}

interface PolicyIdRow {
  id: string;
}

interface CountRow {
  total: bigint | number | string;
}

interface InternalTradeStateRow {
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
  activationLocalDate: Date | string;
  finalLocalDate: Date | string;
  grossNetProgress: DecimalValue;
  grossHighWaterMark: DecimalValue;
  userCreditedAmount: DecimalValue;
  adminRecognizedAmount: DecimalValue;
  nextTradeLocalDate: Date | string;
  settledTradeCount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'BLOCKED';
  completionReason: 'TARGET_REACHED_AT_DURATION_END' | null;
  blockedReason: string | null;
  revision: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class InternalTradingLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async getEarningAuthority(subscriptionId: string): Promise<EarningAuthority> {
    const rows = await this.prisma.$queryRaw<
      Pick<SubscriptionLifecycleRow, 'earningAuthority'>[]
    >(Prisma.sql`
      SELECT earningAuthority
      FROM user_package_subscriptions
      WHERE id = ${subscriptionId}
      LIMIT 1
    `);

    const row = rows[0];

    if (!row) {
      throw new NotFoundException('Package subscription was not found.');
    }

    return row.earningAuthority;
  }

  async initializeActivatedSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const rows = await transaction.$queryRaw<SubscriptionLifecycleRow[]>(
        Prisma.sql`
          SELECT
            id,
            userId,
            packagePlanVersionId,
            packagePlanItemId,
            packageCode,
            packageDisplayName,
            price,
            currency,
            settlementTimezone,
            capMultiplier,
            goalDays,
            earningAuthority,
            internalTradeSplitPolicyVersionId,
            internalTradeUserSharePercent,
            internalTradeAdminSharePercent,
            activatedAt,
          scheduledEndAt,
            status
          FROM user_package_subscriptions
          WHERE id = ${subscriptionId}
          LIMIT 1
          FOR UPDATE
        `,
      );

      const subscription = rows[0];

      if (!subscription) {
        throw new NotFoundException('Package subscription was not found.');
      }

      if (subscription.earningAuthority !== 'INTERNAL_TRADING') {
        return {
          initialized: false,
          created: false,
          earningAuthority: subscription.earningAuthority,
          state: null,
          message: 'Subscription remains on LEGACY_REWARD earning authority.',
        };
      }

      if (subscription.status !== 'ACTIVE') {
        throw new ConflictException(
          'Internal trading lifecycle may only initialize an ACTIVE package.',
        );
      }

      if (
        !subscription.internalTradeSplitPolicyVersionId ||
        subscription.internalTradeUserSharePercent === null ||
        subscription.internalTradeAdminSharePercent === null
      ) {
        throw new ServiceUnavailableException(
          'Internal trading subscription snapshot is incomplete.',
        );
      }

      const existingRows = await transaction.$queryRaw<
        InternalTradeStateRow[]
      >(Prisma.sql`
          SELECT *
          FROM internal_trade_subscription_states
          WHERE subscriptionId = ${subscription.id}
          LIMIT 1
          FOR UPDATE
        `);

      const existing = existingRows[0];

      if (existing) {
        const expectedFinalLocalDate = this.localDate(
          subscription.scheduledEndAt,
          subscription.settlementTimezone,
        );
        const currentFinalLocalDate = this.dateString(existing.finalLocalDate);

        if (
          expectedFinalLocalDate < this.dateString(existing.activationLocalDate)
        ) {
          throw new ConflictException(
            'Internal trading final date cannot precede activation date.',
          );
        }

        if (currentFinalLocalDate !== expectedFinalLocalDate) {
          if (existing.status !== 'ACTIVE') {
            throw new ConflictException(
              'A completed or blocked internal trading lifecycle cannot be date-reconciled.',
            );
          }

          await transaction.$executeRaw(Prisma.sql`
            UPDATE internal_trade_subscription_states
            SET
              finalLocalDate = ${expectedFinalLocalDate},
              revision = revision + 1,
              updatedAt = CURRENT_TIMESTAMP(3)
            WHERE subscriptionId = ${subscription.id}
          `);

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'UPDATE',
              entityType: 'InternalTradeSubscriptionState',
              entityId: subscription.id,
              description:
                'Internal trading lifecycle final date reconciled to authoritative package scheduled end date.',
              metadata: {
                source: 'INTERNAL_TRADING',
                operation: 'RECONCILE_FINAL_LOCAL_DATE',
                subscriptionId: subscription.id,
                previousFinalLocalDate: currentFinalLocalDate,
                finalLocalDate: expectedFinalLocalDate,
                scheduledEndAt: subscription.scheduledEndAt.toISOString(),
                timezoneSnapshot: subscription.settlementTimezone,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          const reconciledRows = await transaction.$queryRaw<
            InternalTradeStateRow[]
          >(Prisma.sql`
              SELECT *
              FROM internal_trade_subscription_states
              WHERE subscriptionId = ${subscription.id}
              LIMIT 1
            `);

          const reconciled = reconciledRows[0];

          if (!reconciled) {
            throw new ServiceUnavailableException(
              'Reconciled internal trading lifecycle state could not be read.',
            );
          }

          return {
            initialized: true,
            created: false,
            reconciled: true,
            earningAuthority: 'INTERNAL_TRADING' as const,
            state: this.stateSnapshot(reconciled),
            message: 'Internal trading lifecycle final date was reconciled.',
          };
        }

        return {
          initialized: true,
          created: false,
          reconciled: false,
          earningAuthority: 'INTERNAL_TRADING' as const,
          state: this.stateSnapshot(existing),
          message: 'Internal trading lifecycle is already synchronized.',
        };
      }

      const policyRows = await transaction.$queryRaw<PolicyIdRow[]>(Prisma.sql`
        SELECT id
        FROM internal_trade_policy_versions
        WHERE id = ${subscription.internalTradeSplitPolicyVersionId}
          AND status = 'PUBLISHED'
        LIMIT 1
        FOR SHARE
      `);

      if (!policyRows[0]) {
        throw new ConflictException(
          'Snapshotted internal trading policy is not published.',
        );
      }

      const principal = new Prisma.Decimal(subscription.price);
      const multiplier = new Prisma.Decimal(subscription.capMultiplier);
      const grossTarget = principal.mul(multiplier).toDecimalPlaces(8);

      if (grossTarget.lte(0)) {
        throw new ConflictException(
          'Internal trading gross target must be positive.',
        );
      }

      const activationLocalDate = this.localDate(
        subscription.activatedAt,
        subscription.settlementTimezone,
      );

      const finalLocalDate = this.localDate(
        subscription.scheduledEndAt,
        subscription.settlementTimezone,
      );

      if (finalLocalDate < activationLocalDate) {
        throw new ConflictException(
          'Internal trading final date cannot precede activation date.',
        );
      }

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO internal_trade_subscription_states (
          subscriptionId,
          userId,
          splitPolicyVersionId,
          packagePlanVersionId,
          packagePlanItemId,
          packageCode,
          packageDisplayName,
          currency,
          principalAmount,
          grossMultiplier,
          grossTarget,
          userSharePercent,
          adminSharePercent,
          timezoneSnapshot,
          activationLocalDate,
          finalLocalDate,
          grossNetProgress,
          grossHighWaterMark,
          userCreditedAmount,
          adminRecognizedAmount,
          nextTradeLocalDate,
          settledTradeCount,
          status,
          revision,
          createdAt,
          updatedAt
        ) VALUES (
          ${subscription.id},
          ${subscription.userId},
          ${subscription.internalTradeSplitPolicyVersionId},
          ${subscription.packagePlanVersionId},
          ${subscription.packagePlanItemId},
          ${subscription.packageCode},
          ${subscription.packageDisplayName},
          ${subscription.currency},
          ${principal.toFixed(8)},
          ${multiplier.toFixed(4)},
          ${grossTarget.toFixed(8)},
          ${new Prisma.Decimal(
            subscription.internalTradeUserSharePercent,
          ).toFixed(6)},
          ${new Prisma.Decimal(
            subscription.internalTradeAdminSharePercent,
          ).toFixed(6)},
          ${subscription.settlementTimezone},
          ${activationLocalDate},
          ${finalLocalDate},
          0.00000000,
          0.00000000,
          0.00000000,
          0.00000000,
          ${activationLocalDate},
          0,
          'ACTIVE',
          1,
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
      `);

      const createdRows = await transaction.$queryRaw<
        InternalTradeStateRow[]
      >(Prisma.sql`
          SELECT *
          FROM internal_trade_subscription_states
          WHERE subscriptionId = ${subscription.id}
          LIMIT 1
        `);

      const created = createdRows[0];

      if (!created) {
        throw new ServiceUnavailableException(
          'Internal trading lifecycle state could not be established.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'InternalTradeSubscriptionState',
          entityId: subscription.id,
          description:
            'Internal trading lifecycle initialized from immutable package and policy snapshots.',
          metadata: {
            source: 'INTERNAL_TRADING',
            operation: 'INITIALIZE_SUBSCRIPTION',
            subscriptionId: subscription.id,
            userId: subscription.userId,
            splitPolicyVersionId:
              subscription.internalTradeSplitPolicyVersionId,
            principalAmount: principal.toFixed(8),
            grossMultiplier: multiplier.toFixed(4),
            grossTarget: grossTarget.toFixed(8),
            userSharePercent: new Prisma.Decimal(
              subscription.internalTradeUserSharePercent,
            ).toFixed(6),
            adminSharePercent: new Prisma.Decimal(
              subscription.internalTradeAdminSharePercent,
            ).toFixed(6),
            timezoneSnapshot: subscription.settlementTimezone,
            activationLocalDate,
            finalLocalDate,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        initialized: true,
        created: true,
        earningAuthority: 'INTERNAL_TRADING' as const,
        state: this.stateSnapshot(created),
        message: 'Internal trading lifecycle initialized.',
      };
    });
  }

  async listStates(query: AdminInternalTradingStateQueryDto) {
    const skip = (query.page - 1) * query.limit;

    const userFilter = query.userId
      ? Prisma.sql`AND its.userId = ${query.userId}`
      : Prisma.empty;

    const statusFilter = query.status
      ? Prisma.sql`AND its.status = ${query.status}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<InternalTradeStateRow[]>(
      Prisma.sql`
        SELECT its.*
        FROM internal_trade_subscription_states its
        WHERE 1 = 1
          ${userFilter}
          ${statusFilter}
        ORDER BY its.nextTradeLocalDate ASC, its.subscriptionId ASC
        LIMIT ${query.limit} OFFSET ${skip}
      `,
    );

    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM internal_trade_subscription_states its
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
    `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
      states: rows.map((row) => this.stateSnapshot(row)),
    };
  }

  async getState(subscriptionId: string) {
    const rows = await this.prisma.$queryRaw<InternalTradeStateRow[]>(
      Prisma.sql`
        SELECT *
        FROM internal_trade_subscription_states
        WHERE subscriptionId = ${subscriptionId}
        LIMIT 1
      `,
    );

    const row = rows[0];

    if (!row) {
      throw new NotFoundException(
        'Internal trading lifecycle state was not found.',
      );
    }

    return this.stateSnapshot(row);
  }

  private stateSnapshot(row: InternalTradeStateRow) {
    return {
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      splitPolicyVersionId: row.splitPolicyVersionId,
      packagePlanVersionId: row.packagePlanVersionId,
      packagePlanItemId: row.packagePlanItemId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      currency: row.currency,
      principalAmount: this.decimalString(row.principalAmount),
      grossMultiplier: new Prisma.Decimal(row.grossMultiplier).toFixed(4),
      grossTarget: this.decimalString(row.grossTarget),
      userSharePercent: this.rateString(row.userSharePercent),
      adminSharePercent: this.rateString(row.adminSharePercent),
      timezoneSnapshot: row.timezoneSnapshot,
      activationLocalDate: this.dateString(row.activationLocalDate),
      finalLocalDate: this.dateString(row.finalLocalDate),
      grossNetProgress: this.decimalString(row.grossNetProgress),
      grossHighWaterMark: this.decimalString(row.grossHighWaterMark),
      userCreditedAmount: this.decimalString(row.userCreditedAmount),
      adminRecognizedAmount: this.decimalString(row.adminRecognizedAmount),
      nextTradeLocalDate: this.dateString(row.nextTradeLocalDate),
      settledTradeCount: row.settledTradeCount,
      status: row.status,
      completionReason: row.completionReason,
      blockedReason: row.blockedReason,
      revision: row.revision,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private localDate(value: Date, timezone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(value);

      const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value;

      const year = get('year');
      const month = get('month');
      const day = get('day');

      if (!year || !month || !day) {
        throw new Error('Incomplete local date.');
      }

      return `${year}-${month}-${day}`;
    } catch {
      throw new ServiceUnavailableException(
        `Invalid settlement timezone: ${timezone}.`,
      );
    }
  }

  private addLocalDays(localDate: string, days: number): string {
    const [year, month, day] = localDate.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day + days));

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private dateString(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }

    return value.toISOString().slice(0, 10);
  }

  private decimalString(value: DecimalValue): string {
    return new Prisma.Decimal(value).toFixed(8);
  }

  private rateString(value: DecimalValue): string {
    return new Prisma.Decimal(value).toFixed(6);
  }

  private countNumber(value: CountRow['total'] | undefined): number {
    if (value === undefined) return 0;
    return Number(value);
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
