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
import type { PackageActivationTrigger } from '../packages/packages.constants';
import {
  depositCreditSourceKey,
  packageActivationSourceKey,
  packagePrincipalAccountKey,
  userWalletAccountKey,
} from '../wallet/wallet.constants';
import type {
  AdminSubscriptionQueryDto,
  SubscriptionPageQueryDto,
} from './dto/subscription.dto';
import { SUBSCRIPTION_AUDIT_OPERATIONS } from './subscriptions.constants';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type DecimalValue = Prisma.Decimal | number | string;
type SubscriptionAuditOperation =
  (typeof SUBSCRIPTION_AUDIT_OPERATIONS)[keyof typeof SUBSCRIPTION_AUDIT_OPERATIONS];

type SupportedPackageActivationTrigger = Extract<
  PackageActivationTrigger,
  'PAYMENT_APPROVED' | 'MANUAL_ACTIVATION'
>;

interface CountRow {
  total: bigint | number | string;
}

interface IdRow {
  id: string;
}

interface OperationsConfigRow {
  platformTimezone: string;
}

interface EffectiveInternalTradePolicyRow {
  id: string;
  userSharePercent: DecimalValue;
  adminSharePercent: DecimalValue;
}

interface FundingEntryRow {
  side: 'DEBIT' | 'CREDIT';
  amount: DecimalValue;
}

interface LedgerTransactionRow {
  id: string;
  kind: 'DEPOSIT_CREDIT' | 'PACKAGE_ACTIVATION_FUNDING';
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  currency: string;
  postedByUserId: string | null;
  description: string;
  metadata: Prisma.JsonValue | null;
  postedAt: Date;
  createdAt: Date;
}

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket:
    | 'MAIN'
    | 'PACKAGE_EARNINGS'
    | 'REFERRAL_COMMISSION'
    | 'REWARDS'
    | 'DEPOSIT_CLEARING'
    | 'PACKAGE_PRINCIPAL';
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

interface SubscriptionRow {
  id: string;
  userId: string;
  sourceDepositId: string;
  sourceDepositAccountingTransactionId: string;
  fundingLedgerTransactionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageDefinitionId: string;
  packageCode: string;
  packageDisplayName: string;
  price: DecimalValue;
  minimumInvestment: DecimalValue | null;
  maximumInvestment: DecimalValue | null;
  durationDays: number | null;
  currency: string;
  activePackageMode: string;
  multipleActivePackageBasis: string;
  activationTrigger: string;
  renewalMode: string;
  upgradesEnabled: boolean | number;
  settlementTimezone: string;
  earningAuthority: 'LEGACY_REWARD' | 'INTERNAL_TRADING';
  internalTradeSplitPolicyVersionId: string | null;
  internalTradeUserSharePercent: DecimalValue | null;
  internalTradeAdminSharePercent: DecimalValue | null;
  rewardRateMode: string;
  fixedRewardRate: DecimalValue | null;
  minimumRewardRate: DecimalValue | null;
  maximumRewardRate: DecimalValue | null;
  rewardRateMeaning: string;
  capBasis: string;
  capMultiplier: DecimalValue;
  principalTreatment: string;
  goalDays: number;
  cycleDays: number;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  cycleEndAction: string;
  capReachedAction: string;
  status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
  activatedAt: Date;
  scheduledEndAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  username?: string;
  email?: string | null;
}

interface ActivationPendingRow {
  depositId: string;
  userId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  amount: DecimalValue;
  currency: string;
  reviewedAt: Date | null;
  accountingTransactionId: string;
  activePackageMode: string;
  activationTrigger: string;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMySubscriptions(userId: string, query: SubscriptionPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<SubscriptionRow[]>(Prisma.sql`
      SELECT ups.*
      FROM user_package_subscriptions ups
      WHERE ups.userId = ${userId}
      ORDER BY ups.activatedAt DESC, ups.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions
      WHERE userId = ${userId}
    `);

    return {
      active: rows
        .filter((row) => row.status === 'ACTIVE')
        .map((row) => this.snapshot(row)),
      history: rows.map((row) => this.snapshot(row)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listSubscriptions(query: AdminSubscriptionQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND ups.userId = ${query.userId}`
      : Prisma.empty;
    const statusFilter = query.status
      ? Prisma.sql`AND ups.status = ${query.status}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<SubscriptionRow[]>(Prisma.sql`
      SELECT ups.*, u.username, u.email
      FROM user_package_subscriptions ups
      INNER JOIN users u ON u.id = ups.userId
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
      ORDER BY ups.activatedAt DESC, ups.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions ups
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
    `);

    return {
      subscriptions: rows.map((row) => ({
        ...this.snapshot(row),
        username: row.username,
        email: row.email,
      })),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async getSubscription(subscriptionId: string) {
    const rows = await this.prisma.$queryRaw<SubscriptionRow[]>(Prisma.sql`
      SELECT ups.*, u.username, u.email
      FROM user_package_subscriptions ups
      INNER JOIN users u ON u.id = ups.userId
      WHERE ups.id = ${subscriptionId}
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Package subscription was not found.');
    }

    return {
      ...this.snapshot(row),
      username: row.username,
      email: row.email,
    };
  }

  async listActivationPending(query: SubscriptionPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<ActivationPendingRow[]>(Prisma.sql`
      SELECT
        d.id AS depositId,
        d.userId,
        u.username,
        u.email,
        d.packageDisplayName,
        d.amount,
        d.currency,
        d.reviewedAt,
        credit.id AS accountingTransactionId,
        ppv.activePackageMode,
        ppv.activationTrigger
      FROM deposits d
      INNER JOIN users u ON u.id = d.userId
      INNER JOIN package_plan_versions ppv
        ON ppv.id = d.packagePlanVersionId
      INNER JOIN ledger_transactions credit
        ON credit.sourceKey = CONCAT('DEPOSIT:', d.id, ':CREDIT')
      LEFT JOIN user_package_subscriptions ups
        ON ups.sourceDepositId = d.id
      WHERE d.status = 'APPROVED'
        AND ups.id IS NULL
      ORDER BY d.reviewedAt ASC, d.id ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM deposits d
      INNER JOIN ledger_transactions credit
        ON credit.sourceKey = CONCAT('DEPOSIT:', d.id, ':CREDIT')
      LEFT JOIN user_package_subscriptions ups
        ON ups.sourceDepositId = d.id
      WHERE d.status = 'APPROVED'
        AND ups.id IS NULL
    `);

    return {
      deposits: rows.map((row) => ({
        ...row,
        amount: this.decimalString(row.amount),
      })),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async activateFromApprovedDeposit(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
    operation: SubscriptionAuditOperation = SUBSCRIPTION_AUDIT_OPERATIONS.ACTIVATE_FROM_DEPOSIT,
    allowedTriggers: readonly SupportedPackageActivationTrigger[] = [
      'PAYMENT_APPROVED',
    ],
  ) {
    return this.runSerializable(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id
        FROM users
        WHERE id = (
          SELECT userId FROM deposits WHERE id = ${depositId} LIMIT 1
        )
        FOR UPDATE
      `);

      const existing = await this.findByDeposit(transaction, depositId, true);
      if (existing) {
        return {
          created: false,
          message: 'Package was already activated from this deposit.',
          subscription: this.snapshot(existing),
        };
      }

      const deposit = await transaction.deposit.findUnique({
        where: { id: depositId },
        select: {
          id: true,
          userId: true,
          status: true,
          amount: true,
          packageMinimumInvestment: true,
          packageMaximumInvestment: true,
          packageDurationDays: true,
          packagePrincipalTreatment: true,
          currency: true,
          packagePlanVersionId: true,
          packagePlanItemId: true,
          packageCode: true,
          packageDisplayName: true,
          reviewedAt: true,
        },
      });
      if (!deposit) {
        throw new NotFoundException('Deposit was not found.');
      }
      if (deposit.status !== 'APPROVED') {
        throw new ConflictException(
          'Only an approved deposit may activate a package.',
        );
      }

      const accountingRows = await transaction.$queryRaw<
        LedgerTransactionRow[]
      >(Prisma.sql`
        SELECT lt.*
        FROM ledger_transactions lt
        WHERE lt.sourceKey = ${depositCreditSourceKey(deposit.id)}
        LIMIT 1
        FOR UPDATE
      `);
      const accountingTransaction = accountingRows[0];
      if (!accountingTransaction) {
        throw new ConflictException(
          'Deposit accounting must be posted before package activation.',
        );
      }

      const planItem = await transaction.packagePlanItem.findUnique({
        where: { id: deposit.packagePlanItemId },
        include: {
          planVersion: true,
          packageDefinition: true,
        },
      });
      if (
        !planItem ||
        planItem.planVersionId !== deposit.packagePlanVersionId
      ) {
        throw new ConflictException(
          'Deposit package snapshot no longer resolves to its source plan item.',
        );
      }

      if (planItem.currency !== deposit.currency) {
        throw new ConflictException(
          'Deposit currency does not match its immutable package source.',
        );
      }

      const rangeDeposit = deposit.packageMinimumInvestment !== null;
      let durationDays = planItem.goalDays;
      let minimumInvestment: string | null = null;
      let maximumInvestment: string | null = null;
      let principalTreatment = planItem.principalTreatment;

      if (rangeDeposit) {
        if (
          deposit.packageMinimumInvestment === null ||
          deposit.packageDurationDays === null ||
          deposit.packagePrincipalTreatment === null ||
          planItem.minimumInvestment === null ||
          planItem.durationDays === null
        ) {
          throw new ConflictException(
            'Range investment lifecycle snapshot is incomplete.',
          );
        }

        if (
          !planItem.minimumInvestment.equals(deposit.packageMinimumInvestment) ||
          !this.optionalDecimalEquals(
            planItem.maximumInvestment,
            deposit.packageMaximumInvestment,
          ) ||
          planItem.durationDays !== deposit.packageDurationDays ||
          planItem.principalTreatment !== deposit.packagePrincipalTreatment
        ) {
          throw new ConflictException(
            'Deposit range/lifecycle snapshot does not match its immutable package source.',
          );
        }

        if (deposit.amount.lt(deposit.packageMinimumInvestment)) {
          throw new ConflictException(
            'Deposit amount is below its immutable package minimum.',
          );
        }

        if (
          deposit.packageMaximumInvestment !== null &&
          deposit.amount.gt(deposit.packageMaximumInvestment)
        ) {
          throw new ConflictException(
            'Deposit amount exceeds its immutable package maximum.',
          );
        }

        durationDays = deposit.packageDurationDays;
        minimumInvestment = deposit.packageMinimumInvestment.toFixed(8);
        maximumInvestment =
          deposit.packageMaximumInvestment?.toFixed(8) ?? null;
        principalTreatment = deposit.packagePrincipalTreatment as typeof principalTreatment;
      } else if (!planItem.price.equals(deposit.amount)) {
        throw new ConflictException(
          'Legacy fixed-price deposit amount does not match its immutable package source.',
        );
      }

      if (
        !allowedTriggers.some(
          (trigger) => trigger === planItem.planVersion.activationTrigger,
        )
      ) {
        throw new ConflictException(
          `Package plan activation trigger ${planItem.planVersion.activationTrigger} is not allowed for ${operation}.`,
        );
      }

      if (planItem.planVersion.activePackageMode === 'SINGLE_ACTIVE') {
        const activeRows = await transaction.$queryRaw<IdRow[]>(Prisma.sql`
          SELECT id
          FROM user_package_subscriptions
          WHERE userId = ${deposit.userId}
            AND status = 'ACTIVE'
          LIMIT 1
        `);
        if (activeRows.length > 0) {
          throw new ConflictException(
            'This plan allows only one active package for the USER.',
          );
        }
      }

      const operationsRows = await transaction.$queryRaw<OperationsConfigRow[]>(
        Prisma.sql`
          SELECT platformTimezone
          FROM system_operations_config
          WHERE id = 1
          LIMIT 1
          FOR SHARE
        `,
      );
      const platformTimezone = operationsRows[0]?.platformTimezone?.trim();
      if (!platformTimezone) {
        throw new ServiceUnavailableException(
          'Platform operations configuration is unavailable.',
        );
      }

      const currency = deposit.currency.toUpperCase();
      const amount = deposit.amount.toFixed(8);
      const fundingSourceKey = packageActivationSourceKey(deposit.id);
      const proposedFundingId = randomUUID();

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
          ${proposedFundingId},
          'PACKAGE_ACTIVATION_FUNDING',
          ${fundingSourceKey},
          'DEPOSIT',
          ${deposit.id},
          ${currency},
          ${actor.id},
          ${`Package ${deposit.packageDisplayName} activated from approved deposit ${deposit.id}.`},
          ${JSON.stringify({
            depositId: deposit.id,
            userId: deposit.userId,
            packageCode: deposit.packageCode,
            packageDisplayName: deposit.packageDisplayName,
            packagePlanVersionId: deposit.packagePlanVersionId,
            packagePlanItemId: deposit.packagePlanItemId,
            amount,
            minimumInvestment,
            maximumInvestment,
            durationDays: rangeDeposit ? durationDays : null,
            principalTreatment,
            currency,
            settlementTimezone: platformTimezone,
            timezoneSource: 'SYSTEM_OPERATIONS_CONFIG',
            referralCommissionApplied: false,
            rewardsApplied: false,
          })},
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE sourceKey = VALUES(sourceKey)
      `);

      const fundingRows = await transaction.$queryRaw<LedgerTransactionRow[]>(
        Prisma.sql`
          SELECT lt.*
          FROM ledger_transactions lt
          WHERE lt.sourceKey = ${fundingSourceKey}
          LIMIT 1
          FOR UPDATE
        `,
      );
      const fundingTransaction = fundingRows[0];
      if (!fundingTransaction) {
        throw new ServiceUnavailableException(
          'Package funding transaction could not be established.',
        );
      }

      const entryCount = await transaction.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM ledger_entries
        WHERE transactionId = ${fundingTransaction.id}
      `);
      if (this.countNumber(entryCount[0]?.total) > 0) {
        throw new ServiceUnavailableException(
          'Package funding exists without its subscription record; reconciliation requires investigation.',
        );
      }

      const mainAccount = await this.requireAccount(
        transaction,
        userWalletAccountKey(deposit.userId, 'MAIN', currency),
        'USER',
        deposit.userId,
        'MAIN',
        currency,
        'CREDIT',
      );
      const principalAccount = await this.ensureSystemPrincipalAccount(
        transaction,
        currency,
      );

      await this.insertLedgerEntry(
        transaction,
        fundingTransaction.id,
        mainAccount.id,
        'DEBIT',
        amount,
        `Package ${deposit.packageDisplayName} principal funded from Main / Deposit.`,
      );
      await this.insertLedgerEntry(
        transaction,
        fundingTransaction.id,
        principalAccount.id,
        'CREDIT',
        amount,
        `Package ${deposit.packageDisplayName} principal received by system package principal account.`,
      );

      await this.assertBalancedFundingEntries(
        transaction,
        fundingTransaction.id,
      );
      await this.applyBalance(transaction, mainAccount, 'DEBIT', amount);
      await this.applyBalance(transaction, principalAccount, 'CREDIT', amount);

      const activatedAt = new Date();

      const internalTradePolicyRows = await transaction.$queryRaw<
        EffectiveInternalTradePolicyRow[]
      >(
        Prisma.sql`
            SELECT
              id,
              userSharePercent,
              adminSharePercent
            FROM internal_trade_policy_versions
            WHERE status = 'PUBLISHED'
              AND enabled = TRUE
              AND effectiveFrom <= ${activatedAt}
              AND (
                effectiveTo IS NULL
                OR effectiveTo > ${activatedAt}
              )
            ORDER BY effectiveFrom DESC, versionNumber DESC
            LIMIT 1
            FOR SHARE
          `,
      );

      const internalTradePolicy = internalTradePolicyRows[0] ?? null;
      const earningAuthority = internalTradePolicy
        ? ('INTERNAL_TRADING' as const)
        : ('LEGACY_REWARD' as const);

      const scheduledEndAt = new Date(
        activatedAt.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );
      const subscriptionId = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO user_package_subscriptions (
          id,
          userId,
          sourceDepositId,
          sourceDepositAccountingTransactionId,
          fundingLedgerTransactionId,
          packagePlanVersionId,
          packagePlanItemId,
          packageDefinitionId,
          packageCode,
          packageDisplayName,
          price,
          minimumInvestment,
          maximumInvestment,
          durationDays,
          currency,
          activePackageMode,
          multipleActivePackageBasis,
          activationTrigger,
          renewalMode,
          upgradesEnabled,
          settlementTimezone,
          earningAuthority,
          internalTradeSplitPolicyVersionId,
          internalTradeUserSharePercent,
          internalTradeAdminSharePercent,
          rewardRateMode,
          fixedRewardRate,
          minimumRewardRate,
          maximumRewardRate,
          rewardRateMeaning,
          capBasis,
          capMultiplier,
          principalTreatment,
          goalDays,
          cycleDays,
          rewardStartMode,
          rewardFrequency,
          cycleDayMode,
          rewardDayMode,
          cycleEndAction,
          capReachedAction,
          status,
          activatedAt,
          scheduledEndAt,
          createdAt,
          updatedAt
        ) VALUES (
          ${subscriptionId},
          ${deposit.userId},
          ${deposit.id},
          ${accountingTransaction.id},
          ${fundingTransaction.id},
          ${deposit.packagePlanVersionId},
          ${deposit.packagePlanItemId},
          ${planItem.packageDefinitionId},
          ${deposit.packageCode},
          ${deposit.packageDisplayName},
          ${amount},
          ${minimumInvestment},
          ${maximumInvestment},
          ${rangeDeposit ? durationDays : null},
          ${currency},
          ${planItem.planVersion.activePackageMode},
          ${planItem.planVersion.multipleActivePackageBasis},
          ${planItem.planVersion.activationTrigger},
          ${planItem.planVersion.renewalMode},
          ${planItem.planVersion.upgradesEnabled},
          ${platformTimezone},
          ${earningAuthority},
          ${internalTradePolicy?.id ?? null},
          ${
            internalTradePolicy
              ? new Prisma.Decimal(
                  internalTradePolicy.userSharePercent,
                ).toFixed(6)
              : null
          },
          ${
            internalTradePolicy
              ? new Prisma.Decimal(
                  internalTradePolicy.adminSharePercent,
                ).toFixed(6)
              : null
          },
          ${planItem.rewardRateMode},
          ${planItem.fixedRewardRate?.toFixed(6) ?? null},
          ${planItem.minimumRewardRate?.toFixed(6) ?? null},
          ${planItem.maximumRewardRate?.toFixed(6) ?? null},
          ${planItem.rewardRateMeaning},
          ${planItem.capBasis},
          ${planItem.capMultiplier.toFixed(4)},
          ${principalTreatment},
          ${planItem.goalDays},
          ${planItem.cycleDays},
          ${planItem.rewardStartMode},
          ${planItem.rewardFrequency},
          ${planItem.cycleDayMode},
          ${planItem.rewardDayMode},
          ${planItem.cycleEndAction},
          ${planItem.capReachedAction},
          'ACTIVE',
          ${activatedAt},
          ${scheduledEndAt},
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'ACTIVATE',
          entityType: 'UserPackageSubscription',
          entityId: subscriptionId,
          description:
            'Approved and accounted deposit activated a USER package.',
          metadata: {
            source: 'PACKAGE_SUBSCRIPTION',
            operation,
            depositId: deposit.id,
            userId: deposit.userId,
            packageCode: deposit.packageCode,
            packageDisplayName: deposit.packageDisplayName,
            amount,
            minimumInvestment,
            maximumInvestment,
            durationDays: rangeDeposit ? durationDays : null,
            principalTreatment,
            currency,
            settlementTimezone: platformTimezone,
            timezoneSource: 'SYSTEM_OPERATIONS_CONFIG',
            earningAuthority,
            internalTradeSplitPolicyVersionId: internalTradePolicy?.id ?? null,
            internalTradeUserSharePercent: internalTradePolicy
              ? new Prisma.Decimal(
                  internalTradePolicy.userSharePercent,
                ).toFixed(6)
              : null,
            internalTradeAdminSharePercent: internalTradePolicy
              ? new Prisma.Decimal(
                  internalTradePolicy.adminSharePercent,
                ).toFixed(6)
              : null,
            sourceDepositAccountingTransactionId: accountingTransaction.id,
            fundingLedgerTransactionId: fundingTransaction.id,
            debitAccount: mainAccount.accountKey,
            creditAccount: principalAccount.accountKey,
            balanced: true,
            referralCommissionApplied: false,
            rewardsApplied: false,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      const created = await this.findByDeposit(transaction, deposit.id, false);
      if (!created) {
        throw new ServiceUnavailableException(
          'Package subscription could not be read after activation.',
        );
      }

      return {
        created: true,
        message: 'Package activated and principal moved from Main / Deposit.',
        subscription: this.snapshot(created),
      };
    });
  }

  async activateAutomaticallyAfterAccounting(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      select: {
        id: true,
        status: true,
        packagePlanVersionId: true,
      },
    });

    if (!deposit) {
      throw new NotFoundException('Deposit was not found.');
    }

    if (deposit.status !== 'APPROVED') {
      throw new ConflictException(
        'Only an approved deposit may be evaluated for package activation.',
      );
    }

    const planVersion = await this.prisma.packagePlanVersion.findUnique({
      where: { id: deposit.packagePlanVersionId },
      select: {
        id: true,
        activePackageMode: true,
        activationTrigger: true,
      },
    });

    if (!planVersion) {
      throw new ConflictException(
        'Deposit package plan version no longer exists.',
      );
    }

    if (planVersion.activationTrigger === 'MANUAL_ACTIVATION') {
      return {
        activationMode: 'MANUAL' as const,
        activationTrigger: planVersion.activationTrigger,
        activePackageMode: planVersion.activePackageMode,
        activationApplied: false,
        activationRequired: true,
        message:
          'Deposit accounting posted. Package is configured for authorized manual activation.',
      };
    }

    if (planVersion.activationTrigger !== 'PAYMENT_APPROVED') {
      return {
        activationMode: 'DEFERRED' as const,
        activationTrigger: planVersion.activationTrigger,
        activePackageMode: planVersion.activePackageMode,
        activationApplied: false,
        activationRequired: true,
        message: `Package activation trigger ${planVersion.activationTrigger} requires its dedicated rule engine.`,
      };
    }

    const activation = await this.activateFromApprovedDeposit(
      depositId,
      actor,
      context,
      SUBSCRIPTION_AUDIT_OPERATIONS.AUTO_ACTIVATE_AFTER_ACCOUNTING,
      ['PAYMENT_APPROVED'],
    );

    return {
      activationMode: 'AUTO' as const,
      activationTrigger: planVersion.activationTrigger,
      activePackageMode: planVersion.activePackageMode,
      activationApplied: true,
      activationRequired: false,
      ...activation,
    };
  }

  async reconcileActivation(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.activateFromApprovedDeposit(
      depositId,
      actor,
      context,
      SUBSCRIPTION_AUDIT_OPERATIONS.RECONCILE_ACTIVATION,
      ['PAYMENT_APPROVED', 'MANUAL_ACTIVATION'],
    );
  }

  private async findByDeposit(
    transaction: Prisma.TransactionClient,
    depositId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<SubscriptionRow[]>(Prisma.sql`
      SELECT *
      FROM user_package_subscriptions
      WHERE sourceDepositId = ${depositId}
      LIMIT 1
      ${lock}
    `);
    return rows[0] ?? null;
  }

  private async requireAccount(
    transaction: Prisma.TransactionClient,
    accountKey: string,
    ownerType: 'SYSTEM' | 'USER',
    ownerUserId: string | null,
    bucket: LedgerAccountRow['bucket'],
    currency: string,
    normalSide: 'DEBIT' | 'CREDIT',
  ) {
    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
      FROM ledger_accounts
      WHERE accountKey = ${accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];
    if (!account) {
      throw new ConflictException(
        'Required Main / Deposit accounting account does not exist.',
      );
    }
    if (
      account.ownerType !== ownerType ||
      account.ownerUserId !== ownerUserId ||
      account.bucket !== bucket ||
      account.currency !== currency ||
      account.normalSide !== normalSide
    ) {
      throw new ServiceUnavailableException(
        'Ledger account semantics are inconsistent.',
      );
    }
    return account;
  }

  private async ensureSystemPrincipalAccount(
    transaction: Prisma.TransactionClient,
    currency: string,
  ) {
    const accountKey = packagePrincipalAccountKey(currency);
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide, createdAt
      ) VALUES (
        ${randomUUID()}, ${accountKey}, 'SYSTEM', NULL, 'PACKAGE_PRINCIPAL', ${currency}, 'CREDIT', CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);
    const account = await this.requireAccount(
      transaction,
      accountKey,
      'SYSTEM',
      null,
      'PACKAGE_PRINCIPAL',
      currency,
      'CREDIT',
    );
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_account_balances (accountId, balance, revision, updatedAt)
      VALUES (${account.id}, 0.00000000, 0, CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE accountId = VALUES(accountId)
    `);
    return account;
  }

  private async insertLedgerEntry(
    transaction: Prisma.TransactionClient,
    transactionId: string,
    accountId: string,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
    memo: string,
  ) {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id, transactionId, accountId, side, amount, memo, createdAt
      ) VALUES (
        ${randomUUID()}, ${transactionId}, ${accountId}, ${side}, ${amount}, ${memo}, CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async assertBalancedFundingEntries(
    transaction: Prisma.TransactionClient,
    transactionId: string,
  ) {
    const entries = await transaction.$queryRaw<FundingEntryRow[]>(Prisma.sql`
      SELECT side, amount
      FROM ledger_entries
      WHERE transactionId = ${transactionId}
      ORDER BY createdAt ASC, id ASC
    `);
    if (entries.length < 2) {
      throw new ServiceUnavailableException(
        'Package funding requires debit and credit entries.',
      );
    }

    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    for (const entry of entries) {
      const amount = new Prisma.Decimal(entry.amount);
      if (entry.side === 'DEBIT') {
        debit = debit.add(amount);
      } else {
        credit = credit.add(amount);
      }
    }

    if (!debit.eq(credit) || debit.lte(0)) {
      throw new ServiceUnavailableException(
        'Package funding ledger transaction is not balanced.',
      );
    }
  }

  private async applyBalance(
    transaction: Prisma.TransactionClient,
    account: LedgerAccountRow,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
  ) {
    const direction = side === account.normalSide ? 1 : -1;
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE ledger_account_balances
      SET
        balance = balance + (${direction} * CAST(${amount} AS DECIMAL(20,8))),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (${direction} * CAST(${amount} AS DECIMAL(20,8))) >= 0
    `);
    if (updated !== 1) {
      throw new ConflictException(
        'Main / Deposit balance is insufficient for package activation.',
      );
    }
  }

  private snapshot(row: SubscriptionRow) {
    return {
      id: row.id,
      userId: row.userId,
      sourceDepositId: row.sourceDepositId,
      sourceDepositAccountingTransactionId:
        row.sourceDepositAccountingTransactionId,
      fundingLedgerTransactionId: row.fundingLedgerTransactionId,
      packagePlanVersionId: row.packagePlanVersionId,
      packagePlanItemId: row.packagePlanItemId,
      packageDefinitionId: row.packageDefinitionId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      price: this.decimalString(row.price),
      minimumInvestment:
        row.minimumInvestment === null
          ? null
          : this.decimalString(row.minimumInvestment),
      maximumInvestment:
        row.maximumInvestment === null
          ? null
          : this.decimalString(row.maximumInvestment),
      durationDays: row.durationDays,
      currency: row.currency,
      activePackageMode: row.activePackageMode,
      multipleActivePackageBasis: row.multipleActivePackageBasis,
      activationTrigger: row.activationTrigger,
      renewalMode: row.renewalMode,
      upgradesEnabled: Boolean(row.upgradesEnabled),
      settlementTimezone: row.settlementTimezone,
      earningAuthority: row.earningAuthority,
      internalTradeSplitPolicyVersionId: row.internalTradeSplitPolicyVersionId,
      internalTradeUserSharePercent:
        row.internalTradeUserSharePercent === null
          ? null
          : this.rateString(row.internalTradeUserSharePercent),
      internalTradeAdminSharePercent:
        row.internalTradeAdminSharePercent === null
          ? null
          : this.rateString(row.internalTradeAdminSharePercent),
      rewardRateMode: row.rewardRateMode,
      fixedRewardRate:
        row.fixedRewardRate === null
          ? null
          : this.rateString(row.fixedRewardRate),
      minimumRewardRate:
        row.minimumRewardRate === null
          ? null
          : this.rateString(row.minimumRewardRate),
      maximumRewardRate:
        row.maximumRewardRate === null
          ? null
          : this.rateString(row.maximumRewardRate),
      rewardRateMeaning: row.rewardRateMeaning,
      capBasis: row.capBasis,
      capMultiplier: new Prisma.Decimal(row.capMultiplier).toFixed(4),
      principalTreatment: row.principalTreatment,
      principalReturn:
        row.principalTreatment === 'RETURN_SEPARATELY'
          ? ('RETURN_EXACT_INVESTED_PRINCIPAL' as const)
          : row.principalTreatment === 'NON_REFUNDABLE_PACKAGE_VALUE'
            ? ('NO_CAPITAL_RETURN' as const)
            : ('LEGACY_INCLUDED_IN_TOTAL_RETURN' as const),
      goalDays: row.goalDays,
      cycleDays: row.cycleDays,
      rewardStartMode: row.rewardStartMode,
      rewardFrequency: row.rewardFrequency,
      cycleDayMode: row.cycleDayMode,
      rewardDayMode: row.rewardDayMode,
      cycleEndAction: row.cycleEndAction,
      capReachedAction: row.capReachedAction,
      status: row.status,
      activatedAt: row.activatedAt,
      scheduledEndAt: row.scheduledEndAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private optionalDecimalEquals(
    left: Prisma.Decimal | null,
    right: Prisma.Decimal | null,
  ) {
    if (left === null || right === null) {
      return left === null && right === null;
    }
    return left.equals(right);
  }

  private decimalString(value: DecimalValue) {
    return new Prisma.Decimal(value).toFixed(8);
  }

  private rateString(value: DecimalValue) {
    return new Prisma.Decimal(value).toFixed(6);
  }

  private countNumber(value: CountRow['total'] | undefined) {
    if (value === undefined) return 0;
    return Number(value);
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
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
