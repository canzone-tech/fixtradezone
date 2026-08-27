import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
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
  referralCommissionExpenseAccountKey,
  referralCommissionSourceKey,
  userWalletAccountKey,
} from '../wallet/wallet.constants';
import {
  COMMISSION_AUDIT_OPERATIONS,
  INITIAL_EXECUTABLE_COMMISSION_POLICY,
  type CommissionCompressionMode,
  type CommissionEventStatus,
  type CommissionPlanStatus,
  type CommissionReleaseMode,
  type CommissionRunOutcome,
  type CommissionUpgradeBaseMode,
  type InactiveUplineAction,
} from './commissions.constants';
import type {
  AdminCommissionQueryDto,
  CommissionLevelRuleDto,
  CommissionPageQueryDto,
  CreateCommissionPlanDraftDto,
  PublishCommissionPlanDto,
  UpdateCommissionPlanDto,
} from './dto/commission.dto';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type DecimalValue = Prisma.Decimal | number | string;
type CommissionAuditOperation =
  (typeof COMMISSION_AUDIT_OPERATIONS)[keyof typeof COMMISSION_AUDIT_OPERATIONS];

interface CountRow {
  total: bigint | number | string;
}

interface CommissionPlanRow {
  id: string;
  versionNumber: number;
  status: CommissionPlanStatus;
  revision: number;
  firstPurchaseEnabled: boolean | number;
  newPurchaseEnabled: boolean | number;
  renewalEnabled: boolean | number;
  upgradeEnabled: boolean | number;
  upgradeBaseMode: CommissionUpgradeBaseMode;
  activePackageRequired: boolean | number;
  inactiveUplineAction: InactiveUplineAction;
  compressionMode: CommissionCompressionMode;
  releaseMode: CommissionReleaseMode;
  holdPeriodHours: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  publishedAt: Date | null;
  clonedFromPlanVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CommissionLevelRow {
  id: string;
  planVersionId: string;
  level: number;
  enabled: boolean | number;
  ratePercent: DecimalValue;
  packageMatchingEnabled: boolean | number;
  createdAt: Date;
  updatedAt: Date;
}

interface SourceSubscriptionRow {
  id: string;
  userId: string;
  sourceDepositId: string;
  packageCode: string;
  packageDisplayName: string;
  price: DecimalValue;
  currency: string;
  status: string;
  activatedAt: Date;
}

interface SponsorHistoryRow {
  newSponsorUserId: string | null;
}

interface ReferralProfileRow {
  sponsorUserId: string | null;
  assignmentStatus: string;
  assignedAt: Date | null;
}

interface ActivePackageRow {
  id: string;
  price: DecimalValue;
  activePackageMode: 'SINGLE_ACTIVE' | 'MULTIPLE_ACTIVE';
  multipleActivePackageBasis:
    | 'HIGHEST_ACTIVE_PACKAGE'
    | 'TOTAL_ACTIVE_PACKAGE_VALUE'
    | 'PRIMARY_PACKAGE';
  activatedAt: Date;
}

interface CommissionRunRow {
  id: string;
  sourceSubscriptionId: string;
  sourceDepositId: string;
  purchaserUserId: string;
  commissionPlanVersionId: string | null;
  sourcePackageCode: string;
  sourcePackageDisplayName: string;
  sourcePackageValue: DecimalValue;
  currency: string;
  sourceActivatedAt: Date;
  outcome: CommissionRunOutcome;
  routeSnapshot: Prisma.JsonValue | null;
  processedAt: Date;
  createdAt: Date;
}

interface CommissionEventRow {
  id: string;
  runId: string;
  sourceSubscriptionId: string;
  receiverUserId: string;
  purchaserUserId: string;
  commissionPlanVersionId: string;
  level: number;
  sourceKey: string;
  currency: string;
  sourcePackageValue: DecimalValue;
  receiverPackageBasis: DecimalValue;
  packageMatchingEnabled: boolean | number;
  eligibleBase: DecimalValue;
  ratePercent: DecimalValue;
  commissionAmount: DecimalValue;
  releaseMode: CommissionReleaseMode;
  status: CommissionEventStatus;
  ineligibilityReason: string | null;
  ledgerTransactionId: string | null;
  availableAt: Date | null;
  createdAt: Date;
  receiverUsername?: string;
  receiverEmail?: string | null;
  purchaserUsername?: string;
  purchaserEmail?: string | null;
  sourcePackageDisplayName?: string;
}

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket:
    | 'REFERRAL_COMMISSION'
    | 'REFERRAL_COMMISSION_EXPENSE';
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

interface LedgerEntryAmountRow {
  side: 'DEBIT' | 'CREDIT';
  amount: DecimalValue;
}

interface WalletBalanceRow {
  currency: string;
  balance: DecimalValue;
}

interface ReconciliationRow {
  subscriptionId: string;
  purchaserUserId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  price: DecimalValue;
  currency: string;
  activatedAt: Date;
}

interface RouteNode {
  level: number;
  receiverUserId: string;
}

@Injectable()
export class CommissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    const rows = await this.prisma.$queryRaw<CommissionPlanRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_plan_versions
      ORDER BY versionNumber DESC
    `);

    const plans = [];
    for (const row of rows) {
      plans.push(await this.planSnapshotWithLevels(this.prisma, row));
    }
    return { plans };
  }

  async getPlan(planVersionId: string) {
    const row = await this.requirePlan(this.prisma, planVersionId, false);
    return this.planSnapshotWithLevels(this.prisma, row);
  }

  async createDraft(
    dto: CreateCommissionPlanDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const draftRows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id
        FROM referral_commission_plan_versions
        WHERE status = 'DRAFT'
        LIMIT 1
        FOR UPDATE
      `);
      if (draftRows.length > 0) {
        throw new ConflictException(
          'A referral commission draft already exists. Publish or finish that draft first.',
        );
      }

      const source = await this.requirePlan(
        transaction,
        dto.sourcePlanVersionId,
        true,
      );
      if (source.status !== 'PUBLISHED') {
        throw new ConflictException(
          'Only a published referral commission plan can be cloned.',
        );
      }
      const sourceLevels = await this.getLevels(transaction, source.id);
      const maxRows = await transaction.$queryRaw<
        { maxVersion: number | null }[]
      >(Prisma.sql`
        SELECT MAX(versionNumber) AS maxVersion
        FROM referral_commission_plan_versions
      `);
      const versionNumber = (maxRows[0]?.maxVersion ?? 0) + 1;
      const id = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO referral_commission_plan_versions (
          id, versionNumber, status, revision,
          firstPurchaseEnabled, newPurchaseEnabled, renewalEnabled, upgradeEnabled,
          upgradeBaseMode, activePackageRequired, inactiveUplineAction,
          compressionMode, releaseMode, holdPeriodHours,
          effectiveFrom, effectiveTo, publishedAt, clonedFromPlanVersionId,
          createdByUserId, updatedByUserId, publishedByUserId,
          createdAt, updatedAt
        ) VALUES (
          ${id}, ${versionNumber}, 'DRAFT', 1,
          ${Boolean(source.firstPurchaseEnabled)}, ${Boolean(source.newPurchaseEnabled)},
          ${Boolean(source.renewalEnabled)}, ${Boolean(source.upgradeEnabled)},
          ${source.upgradeBaseMode}, ${Boolean(source.activePackageRequired)},
          ${source.inactiveUplineAction}, ${source.compressionMode},
          ${source.releaseMode}, ${source.holdPeriodHours},
          NULL, NULL, NULL, ${source.id},
          ${actor.id}, ${actor.id}, NULL,
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      for (const level of sourceLevels) {
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO referral_commission_level_rules (
            id, planVersionId, level, enabled, ratePercent,
            packageMatchingEnabled, createdAt, updatedAt
          ) VALUES (
            ${randomUUID()}, ${id}, ${level.level}, ${Boolean(level.enabled)},
            ${this.rateString(level.ratePercent)},
            ${Boolean(level.packageMatchingEnabled)},
            CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
          )
        `);
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'ReferralCommissionPlanVersion',
          entityId: id,
          description: 'Published referral commission plan cloned into a new draft.',
          metadata: {
            operation: COMMISSION_AUDIT_OPERATIONS.CLONE_DRAFT,
            sourcePlanVersionId: source.id,
            versionNumber,
            reason: dto.reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      const created = await this.requirePlan(transaction, id, false);
      return this.planSnapshotWithLevels(transaction, created);
    });
  }

  async updateDraft(
    planVersionId: string,
    dto: UpdateCommissionPlanDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const current = await this.requirePlan(transaction, planVersionId, true);
      if (current.status !== 'DRAFT') {
        throw new ConflictException(
          'Published referral commission terms are immutable.',
        );
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Referral commission draft revision changed. Reload before saving.',
        );
      }

      const currentLevels = await this.getLevels(transaction, current.id);
      const levels = dto.levels ?? currentLevels.map((level) => ({
        level: level.level,
        enabled: Boolean(level.enabled),
        ratePercent: this.rateString(level.ratePercent),
        packageMatchingEnabled: Boolean(level.packageMatchingEnabled),
      }));

      const next = {
        firstPurchaseEnabled:
          dto.firstPurchaseEnabled ?? Boolean(current.firstPurchaseEnabled),
        newPurchaseEnabled:
          dto.newPurchaseEnabled ?? Boolean(current.newPurchaseEnabled),
        renewalEnabled: dto.renewalEnabled ?? Boolean(current.renewalEnabled),
        upgradeEnabled: dto.upgradeEnabled ?? Boolean(current.upgradeEnabled),
        upgradeBaseMode: dto.upgradeBaseMode ?? current.upgradeBaseMode,
        activePackageRequired:
          dto.activePackageRequired ?? Boolean(current.activePackageRequired),
        inactiveUplineAction:
          dto.inactiveUplineAction ?? current.inactiveUplineAction,
        compressionMode: dto.compressionMode ?? current.compressionMode,
        releaseMode: dto.releaseMode ?? current.releaseMode,
        holdPeriodHours: dto.holdPeriodHours ?? current.holdPeriodHours,
      };

      this.validatePlanConfiguration(next, levels, false);

      await transaction.$executeRaw(Prisma.sql`
        UPDATE referral_commission_plan_versions
        SET
          revision = revision + 1,
          firstPurchaseEnabled = ${next.firstPurchaseEnabled},
          newPurchaseEnabled = ${next.newPurchaseEnabled},
          renewalEnabled = ${next.renewalEnabled},
          upgradeEnabled = ${next.upgradeEnabled},
          upgradeBaseMode = ${next.upgradeBaseMode},
          activePackageRequired = ${next.activePackageRequired},
          inactiveUplineAction = ${next.inactiveUplineAction},
          compressionMode = ${next.compressionMode},
          releaseMode = ${next.releaseMode},
          holdPeriodHours = ${next.holdPeriodHours},
          updatedByUserId = ${actor.id},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${current.id}
          AND revision = ${current.revision}
      `);

      if (dto.levels) {
        await transaction.$executeRaw(Prisma.sql`
          DELETE FROM referral_commission_level_rules
          WHERE planVersionId = ${current.id}
        `);
        for (const level of levels) {
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO referral_commission_level_rules (
              id, planVersionId, level, enabled, ratePercent,
              packageMatchingEnabled, createdAt, updatedAt
            ) VALUES (
              ${randomUUID()}, ${current.id}, ${level.level}, ${level.enabled},
              ${this.rateString(level.ratePercent)},
              ${level.packageMatchingEnabled},
              CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
            )
          `);
        }
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'ReferralCommissionPlanVersion',
          entityId: current.id,
          description: 'Referral commission draft updated.',
          metadata: {
            operation: COMMISSION_AUDIT_OPERATIONS.UPDATE_DRAFT,
            previousRevision: current.revision,
            newRevision: current.revision + 1,
            reason: dto.reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      const updated = await this.requirePlan(transaction, current.id, false);
      return this.planSnapshotWithLevels(transaction, updated);
    });
  }

  async publishPlan(
    planVersionId: string,
    dto: PublishCommissionPlanDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const current = await this.requirePlan(transaction, planVersionId, true);
      if (current.status !== 'DRAFT') {
        throw new ConflictException('Referral commission plan is already published.');
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Referral commission draft revision changed. Reload before publishing.',
        );
      }

      const levels = await this.getLevels(transaction, current.id);
      const normalizedLevels = levels.map((level) => ({
        level: level.level,
        enabled: Boolean(level.enabled),
        ratePercent: this.rateString(level.ratePercent),
        packageMatchingEnabled: Boolean(level.packageMatchingEnabled),
      }));
      this.validatePlanConfiguration(
        {
          firstPurchaseEnabled: Boolean(current.firstPurchaseEnabled),
          newPurchaseEnabled: Boolean(current.newPurchaseEnabled),
          renewalEnabled: Boolean(current.renewalEnabled),
          upgradeEnabled: Boolean(current.upgradeEnabled),
          upgradeBaseMode: current.upgradeBaseMode,
          activePackageRequired: Boolean(current.activePackageRequired),
          inactiveUplineAction: current.inactiveUplineAction,
          compressionMode: current.compressionMode,
          releaseMode: current.releaseMode,
          holdPeriodHours: current.holdPeriodHours,
        },
        normalizedLevels,
        true,
      );

      const now = new Date();
      const effectiveFrom = dto.effectiveFrom
        ? this.parseDate(dto.effectiveFrom, 'effectiveFrom')
        : now;
      const effectiveTo = dto.effectiveTo
        ? this.parseDate(dto.effectiveTo, 'effectiveTo')
        : null;

      if (dto.effectiveFrom && effectiveFrom.getTime() < now.getTime()) {
        throw new BadRequestException(
          'Referral commission plan effectiveFrom cannot be backdated.',
        );
      }
      if (effectiveTo && effectiveTo <= effectiveFrom) {
        throw new BadRequestException('effectiveTo must be after effectiveFrom.');
      }

      const overlaps = await transaction.$queryRaw<CommissionPlanRow[]>(Prisma.sql`
        SELECT *
        FROM referral_commission_plan_versions
        WHERE status = 'PUBLISHED'
          AND (effectiveTo IS NULL OR effectiveTo > ${effectiveFrom})
          AND (${effectiveTo} IS NULL OR effectiveFrom < ${effectiveTo})
        ORDER BY effectiveFrom ASC
        FOR UPDATE
      `);

      if (overlaps.length > 1) {
        throw new ConflictException(
          'Published referral commission plan ranges overlap; resolve configuration before publishing.',
        );
      }
      if (overlaps.length === 1) {
        const predecessor = overlaps[0];
        if (
          predecessor.effectiveTo !== null ||
          predecessor.effectiveFrom === null ||
          predecessor.effectiveFrom >= effectiveFrom
        ) {
          throw new ConflictException(
            'Referral commission plan effective range overlaps an existing publication.',
          );
        }
        await transaction.$executeRaw(Prisma.sql`
          UPDATE referral_commission_plan_versions
          SET effectiveTo = ${effectiveFrom}, updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${predecessor.id}
        `);
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE referral_commission_plan_versions
        SET
          status = 'PUBLISHED',
          revision = revision + 1,
          effectiveFrom = ${effectiveFrom},
          effectiveTo = ${effectiveTo},
          publishedAt = CURRENT_TIMESTAMP(3),
          updatedByUserId = ${actor.id},
          publishedByUserId = ${actor.id},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${current.id}
          AND status = 'DRAFT'
          AND revision = ${current.revision}
      `);
      if (updated !== 1) {
        throw new ConflictException(
          'Referral commission draft changed concurrently. Reload before publishing.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'ReferralCommissionPlanVersion',
          entityId: current.id,
          description: 'Referral commission plan published.',
          metadata: {
            operation: COMMISSION_AUDIT_OPERATIONS.PUBLISH_PLAN,
            reason: dto.reason,
            versionNumber: current.versionNumber,
            effectiveFrom: effectiveFrom.toISOString(),
            effectiveTo: effectiveTo?.toISOString() ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      const published = await this.requirePlan(transaction, current.id, false);
      return this.planSnapshotWithLevels(transaction, published);
    });
  }

  async getMyCommissions(userId: string, query: CommissionPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const balances = await this.prisma.$queryRaw<WalletBalanceRow[]>(Prisma.sql`
      SELECT la.currency, COALESCE(lb.balance, 0.00000000) AS balance
      FROM ledger_accounts la
      LEFT JOIN ledger_account_balances lb ON lb.accountId = la.id
      WHERE la.ownerType = 'USER'
        AND la.ownerUserId = ${userId}
        AND la.bucket = 'REFERRAL_COMMISSION'
      ORDER BY la.currency ASC
    `);
    const events = await this.prisma.$queryRaw<CommissionEventRow[]>(Prisma.sql`
      SELECT
        rce.*,
        purchaser.username AS purchaserUsername,
        purchaser.email AS purchaserEmail,
        ups.packageDisplayName AS sourcePackageDisplayName
      FROM referral_commission_events rce
      INNER JOIN users purchaser ON purchaser.id = rce.purchaserUserId
      INNER JOIN user_package_subscriptions ups ON ups.id = rce.sourceSubscriptionId
      WHERE rce.receiverUserId = ${userId}
      ORDER BY rce.createdAt DESC, rce.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM referral_commission_events
      WHERE receiverUserId = ${userId}
    `);

    return {
      balances: balances.map((row) => ({
        currency: row.currency,
        referralCommission: this.decimalString(row.balance),
      })),
      events: events.map((row) => this.eventSnapshot(row)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listCommissions(query: AdminCommissionQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const receiverFilter = query.receiverUserId
      ? Prisma.sql`AND rce.receiverUserId = ${query.receiverUserId}`
      : Prisma.empty;
    const purchaserFilter = query.purchaserUserId
      ? Prisma.sql`AND rce.purchaserUserId = ${query.purchaserUserId}`
      : Prisma.empty;
    const statusFilter = query.status
      ? Prisma.sql`AND rce.status = ${query.status}`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND rce.currency = ${query.currency}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<CommissionEventRow[]>(Prisma.sql`
      SELECT
        rce.*,
        receiver.username AS receiverUsername,
        receiver.email AS receiverEmail,
        purchaser.username AS purchaserUsername,
        purchaser.email AS purchaserEmail,
        ups.packageDisplayName AS sourcePackageDisplayName
      FROM referral_commission_events rce
      INNER JOIN users receiver ON receiver.id = rce.receiverUserId
      INNER JOIN users purchaser ON purchaser.id = rce.purchaserUserId
      INNER JOIN user_package_subscriptions ups ON ups.id = rce.sourceSubscriptionId
      WHERE 1 = 1
        ${receiverFilter}
        ${purchaserFilter}
        ${statusFilter}
        ${currencyFilter}
      ORDER BY rce.createdAt DESC, rce.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM referral_commission_events rce
      WHERE 1 = 1
        ${receiverFilter}
        ${purchaserFilter}
        ${statusFilter}
        ${currencyFilter}
    `);

    return {
      commissions: rows.map((row) => this.eventSnapshot(row)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listReconciliation(query: CommissionPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`
      SELECT
        ups.id AS subscriptionId,
        ups.userId AS purchaserUserId,
        u.username,
        u.email,
        ups.packageDisplayName,
        ups.price,
        ups.currency,
        ups.activatedAt
      FROM user_package_subscriptions ups
      INNER JOIN users u ON u.id = ups.userId
      LEFT JOIN referral_commission_runs rcr
        ON rcr.sourceSubscriptionId = ups.id
      WHERE rcr.id IS NULL
      ORDER BY ups.activatedAt ASC, ups.id ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions ups
      LEFT JOIN referral_commission_runs rcr
        ON rcr.sourceSubscriptionId = ups.id
      WHERE rcr.id IS NULL
    `);

    return {
      subscriptions: rows.map((row) => ({
        ...row,
        price: this.decimalString(row.price),
      })),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async processSubscriptionSafely(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
    operation: CommissionAuditOperation =
      COMMISSION_AUDIT_OPERATIONS.PROCESS_SUBSCRIPTION,
  ) {
    try {
      const result = await this.processSubscription(
        subscriptionId,
        actor,
        context,
        operation,
      );
      return {
        processingStatus: 'PROCESSED' as const,
        ...result,
      };
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      ) {
        return {
          processingStatus: 'PENDING_RECONCILIATION' as const,
          message:
            error instanceof Error
              ? error.message
              : 'Referral commission requires reconciliation.',
        };
      }
      throw error;
    }
  }

  async reconcileSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.processSubscription(
      subscriptionId,
      actor,
      context,
      COMMISSION_AUDIT_OPERATIONS.RECONCILE_SUBSCRIPTION,
    );
  }

  async processSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
    operation: CommissionAuditOperation =
      COMMISSION_AUDIT_OPERATIONS.PROCESS_SUBSCRIPTION,
  ) {
    return this.runSerializable(async (transaction) => {
      const sourceRows = await transaction.$queryRaw<SourceSubscriptionRow[]>(
        Prisma.sql`
          SELECT
            id, userId, sourceDepositId, packageCode, packageDisplayName,
            price, currency, status, activatedAt
          FROM user_package_subscriptions
          WHERE id = ${subscriptionId}
          LIMIT 1
          FOR UPDATE
        `,
      );
      const source = sourceRows[0];
      if (!source) {
        throw new NotFoundException('Package subscription was not found.');
      }

      const existing = await this.findRun(transaction, source.id);
      if (existing) {
        return this.runSnapshotWithEvents(transaction, existing, false);
      }

      const planRows = await transaction.$queryRaw<CommissionPlanRow[]>(Prisma.sql`
        SELECT *
        FROM referral_commission_plan_versions
        WHERE status = 'PUBLISHED'
          AND effectiveFrom <= ${source.activatedAt}
          AND (effectiveTo IS NULL OR effectiveTo > ${source.activatedAt})
        ORDER BY effectiveFrom DESC, versionNumber DESC
        LIMIT 1
        FOR UPDATE
      `);
      const plan = planRows[0];
      if (!plan) {
        const run = await this.insertRun(
          transaction,
          source,
          null,
          'NO_EFFECTIVE_PLAN',
          {
            reason: 'No effective published commission plan at source activation time.',
          },
        );
        await this.auditRun(transaction, actor, context, operation, run, [], {
          reason: 'NO_EFFECTIVE_PLAN',
        });
        return this.runSnapshotWithEvents(transaction, run, true);
      }

      const priorRows = await transaction.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM user_package_subscriptions
        WHERE userId = ${source.userId}
          AND activatedAt < ${source.activatedAt}
      `);
      const isFirstPurchase = this.countNumber(priorRows[0]?.total) === 0;
      const triggerEnabled = isFirstPurchase
        ? Boolean(plan.firstPurchaseEnabled)
        : Boolean(plan.newPurchaseEnabled);

      if (!triggerEnabled) {
        const run = await this.insertRun(
          transaction,
          source,
          plan,
          'PROCESSED',
          {
            triggerType: isFirstPurchase ? 'FIRST_PURCHASE' : 'NEW_PURCHASE',
            triggerEnabled: false,
          },
        );
        await this.auditRun(transaction, actor, context, operation, run, [], {
          reason: 'TRIGGER_DISABLED',
        });
        return this.runSnapshotWithEvents(transaction, run, true);
      }

      const levels = (await this.getLevels(transaction, plan.id)).filter((level) =>
        Boolean(level.enabled),
      );
      if (levels.length === 0) {
        throw new ServiceUnavailableException(
          'Published commission plan has no enabled level rules.',
        );
      }

      const maxLevel = Math.max(...levels.map((level) => level.level));
      const route = await this.resolveSponsorRoute(
        transaction,
        source.userId,
        source.activatedAt,
        maxLevel,
      );
      if (route.length === 0) {
        const run = await this.insertRun(
          transaction,
          source,
          plan,
          'NO_SPONSOR',
          [],
        );
        await this.auditRun(transaction, actor, context, operation, run, [], {
          reason: 'NO_SPONSOR',
        });
        return this.runSnapshotWithEvents(transaction, run, true);
      }

      const run = await this.insertRun(
        transaction,
        source,
        plan,
        'PROCESSED',
        route,
      );
      const events: CommissionEventRow[] = [];

      for (const rule of levels) {
        const routeNode = route.find((node) => node.level === rule.level);
        if (!routeNode) continue;

        const receiverBasis = await this.resolveReceiverPackageBasis(
          transaction,
          routeNode.receiverUserId,
          source.currency,
          source.activatedAt,
        );
        const matchingEnabled = Boolean(rule.packageMatchingEnabled);
        const rate = new Prisma.Decimal(rule.ratePercent);
        const sourceValue = new Prisma.Decimal(source.price);

        if (Boolean(plan.activePackageRequired) && receiverBasis.lte(0)) {
          const lost = await this.insertEvent(transaction, {
            runId: run.id,
            source,
            plan,
            receiverUserId: routeNode.receiverUserId,
            level: rule.level,
            packageMatchingEnabled: matchingEnabled,
            receiverPackageBasis: '0.00000000',
            eligibleBase: '0.00000000',
            ratePercent: rate.toFixed(6),
            commissionAmount: '0.00000000',
            status: 'LOST',
            ineligibilityReason: 'NO_ACTIVE_PACKAGE',
            ledgerTransactionId: null,
            availableAt: null,
          });
          events.push(lost);
          continue;
        }

        const eligibleBase = matchingEnabled
          ? Prisma.Decimal.min(receiverBasis, sourceValue)
          : sourceValue;
        const amount = eligibleBase.mul(rate).div(100).toDecimalPlaces(8);

        if (eligibleBase.lte(0) || amount.lte(0)) {
          const lost = await this.insertEvent(transaction, {
            runId: run.id,
            source,
            plan,
            receiverUserId: routeNode.receiverUserId,
            level: rule.level,
            packageMatchingEnabled: matchingEnabled,
            receiverPackageBasis: receiverBasis.toFixed(8),
            eligibleBase: eligibleBase.toFixed(8),
            ratePercent: rate.toFixed(6),
            commissionAmount: '0.00000000',
            status: 'LOST',
            ineligibilityReason: 'ZERO_ELIGIBLE_BASE',
            ledgerTransactionId: null,
            availableAt: null,
          });
          events.push(lost);
          continue;
        }

        const sourceKey = referralCommissionSourceKey(
          source.id,
          rule.level,
          routeNode.receiverUserId,
        );
        const ledgerTransactionId = await this.postImmediateCommission(
          transaction,
          sourceKey,
          source,
          plan,
          routeNode,
          receiverBasis,
          eligibleBase,
          rate,
          amount,
          actor,
        );
        const availableAt = new Date();
        const created = await this.insertEvent(transaction, {
          runId: run.id,
          source,
          plan,
          receiverUserId: routeNode.receiverUserId,
          level: rule.level,
          packageMatchingEnabled: matchingEnabled,
          receiverPackageBasis: receiverBasis.toFixed(8),
          eligibleBase: eligibleBase.toFixed(8),
          ratePercent: rate.toFixed(6),
          commissionAmount: amount.toFixed(8),
          status: 'AVAILABLE',
          ineligibilityReason: null,
          ledgerTransactionId,
          availableAt,
        });
        events.push(created);
      }

      await this.auditRun(transaction, actor, context, operation, run, events, {
        triggerType: isFirstPurchase ? 'FIRST_PURCHASE' : 'NEW_PURCHASE',
        triggerEnabled: true,
      });
      return this.runSnapshotWithEvents(transaction, run, true);
    });
  }

  private validatePlanConfiguration(
    plan: {
      firstPurchaseEnabled: boolean;
      newPurchaseEnabled: boolean;
      renewalEnabled: boolean;
      upgradeEnabled: boolean;
      upgradeBaseMode: CommissionUpgradeBaseMode;
      activePackageRequired: boolean;
      inactiveUplineAction: InactiveUplineAction;
      compressionMode: CommissionCompressionMode;
      releaseMode: CommissionReleaseMode;
      holdPeriodHours: number;
    },
    levels: CommissionLevelRuleDto[],
    forPublication: boolean,
  ) {
    if (levels.length === 0) {
      throw new BadRequestException('At least one commission level is required.');
    }
    const seen = new Set<number>();
    let enabledCount = 0;
    for (const level of levels) {
      if (seen.has(level.level)) {
        throw new BadRequestException('Commission levels must be unique.');
      }
      seen.add(level.level);
      const rate = new Prisma.Decimal(level.ratePercent);
      if (rate.lte(0) || rate.gt(100)) {
        throw new BadRequestException(
          'Commission rate must be greater than 0 and at most 100 percent.',
        );
      }
      if (level.enabled) enabledCount += 1;
      if (level.packageMatchingEnabled && !plan.activePackageRequired) {
        throw new BadRequestException(
          'Package matching requires active-package qualification.',
        );
      }
    }
    if (enabledCount === 0) {
      throw new BadRequestException('At least one commission level must be enabled.');
    }
    if (plan.holdPeriodHours < 0) {
      throw new BadRequestException('holdPeriodHours cannot be negative.');
    }
    if (plan.releaseMode === 'IMMEDIATE' && plan.holdPeriodHours !== 0) {
      throw new BadRequestException(
        'Immediate commission release requires holdPeriodHours = 0.',
      );
    }
    if (!plan.firstPurchaseEnabled && !plan.newPurchaseEnabled) {
      throw new BadRequestException(
        'First purchase and new purchase cannot both be disabled in COMM-01.',
      );
    }

    if (forPublication) {
      if (
        plan.inactiveUplineAction !==
          INITIAL_EXECUTABLE_COMMISSION_POLICY.inactiveUplineAction ||
        plan.compressionMode !==
          INITIAL_EXECUTABLE_COMMISSION_POLICY.compressionMode ||
        plan.releaseMode !== INITIAL_EXECUTABLE_COMMISSION_POLICY.releaseMode
      ) {
        throw new BadRequestException(
          'This commission policy requires a deferred routing/release engine and cannot be published yet.',
        );
      }
      if (plan.renewalEnabled || plan.upgradeEnabled) {
        throw new BadRequestException(
          'Renewal/upgrade commission execution is not available in COMM-01.',
        );
      }
    }
  }

  private async requirePlan(
    transaction: Prisma.TransactionClient | PrismaService,
    planVersionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<CommissionPlanRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_plan_versions
      WHERE id = ${planVersionId}
      LIMIT 1
      ${lock}
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Referral commission plan was not found.');
    }
    return row;
  }

  private getLevels(
    transaction: Prisma.TransactionClient | PrismaService,
    planVersionId: string,
  ) {
    return transaction.$queryRaw<CommissionLevelRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_level_rules
      WHERE planVersionId = ${planVersionId}
      ORDER BY level ASC
    `);
  }

  private async planSnapshotWithLevels(
    transaction: Prisma.TransactionClient | PrismaService,
    row: CommissionPlanRow,
  ) {
    const levels = await this.getLevels(transaction, row.id);
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      revision: row.revision,
      firstPurchaseEnabled: Boolean(row.firstPurchaseEnabled),
      newPurchaseEnabled: Boolean(row.newPurchaseEnabled),
      renewalEnabled: Boolean(row.renewalEnabled),
      upgradeEnabled: Boolean(row.upgradeEnabled),
      upgradeBaseMode: row.upgradeBaseMode,
      activePackageRequired: Boolean(row.activePackageRequired),
      inactiveUplineAction: row.inactiveUplineAction,
      compressionMode: row.compressionMode,
      releaseMode: row.releaseMode,
      holdPeriodHours: row.holdPeriodHours,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      publishedAt: row.publishedAt,
      clonedFromPlanVersionId: row.clonedFromPlanVersionId,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      publishedByUserId: row.publishedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      levels: levels.map((level) => ({
        id: level.id,
        level: level.level,
        enabled: Boolean(level.enabled),
        ratePercent: this.rateString(level.ratePercent),
        packageMatchingEnabled: Boolean(level.packageMatchingEnabled),
      })),
    };
  }

  private async resolveSponsorRoute(
    transaction: Prisma.TransactionClient,
    purchaserUserId: string,
    at: Date,
    maxLevel: number,
  ) {
    const route: RouteNode[] = [];
    const seen = new Set<string>([purchaserUserId]);
    let memberUserId = purchaserUserId;

    for (let level = 1; level <= maxLevel; level += 1) {
      const sponsorUserId = await this.resolveSponsorAt(
        transaction,
        memberUserId,
        at,
      );
      if (!sponsorUserId) break;
      if (seen.has(sponsorUserId)) {
        throw new ServiceUnavailableException(
          'Historical referral cycle detected while resolving commission route.',
        );
      }
      seen.add(sponsorUserId);
      route.push({ level, receiverUserId: sponsorUserId });
      memberUserId = sponsorUserId;
    }
    return route;
  }

  private async resolveSponsorAt(
    transaction: Prisma.TransactionClient,
    memberUserId: string,
    at: Date,
  ) {
    const history = await transaction.$queryRaw<SponsorHistoryRow[]>(Prisma.sql`
      SELECT newSponsorUserId
      FROM referral_sponsor_history
      WHERE memberUserId = ${memberUserId}
        AND createdAt <= ${at}
      ORDER BY createdAt DESC, id DESC
      LIMIT 1
    `);
    if (history.length > 0) return history[0].newSponsorUserId;

    const profiles = await transaction.$queryRaw<ReferralProfileRow[]>(Prisma.sql`
      SELECT sponsorUserId, assignmentStatus, assignedAt
      FROM referral_profiles
      WHERE userId = ${memberUserId}
      LIMIT 1
    `);
    const profile = profiles[0];
    if (
      !profile ||
      profile.assignmentStatus !== 'ASSIGNED' ||
      !profile.sponsorUserId ||
      !profile.assignedAt ||
      profile.assignedAt > at
    ) {
      return null;
    }
    return profile.sponsorUserId;
  }

  private async resolveReceiverPackageBasis(
    transaction: Prisma.TransactionClient,
    receiverUserId: string,
    currency: string,
    at: Date,
  ) {
    const rows = await transaction.$queryRaw<ActivePackageRow[]>(Prisma.sql`
      SELECT
        id, price, activePackageMode, multipleActivePackageBasis, activatedAt
      FROM user_package_subscriptions
      WHERE userId = ${receiverUserId}
        AND currency = ${currency}
        AND activatedAt <= ${at}
        AND (status = 'ACTIVE' OR completedAt > ${at})
      ORDER BY activatedAt DESC, id DESC
    `);
    if (rows.length === 0) return new Prisma.Decimal(0);

    const policy = rows[0];
    if (policy.activePackageMode === 'SINGLE_ACTIVE') {
      return new Prisma.Decimal(policy.price);
    }
    if (policy.multipleActivePackageBasis === 'PRIMARY_PACKAGE') {
      throw new ServiceUnavailableException(
        'PRIMARY_PACKAGE commission qualification requires the primary-package selector engine.',
      );
    }
    if (policy.multipleActivePackageBasis === 'TOTAL_ACTIVE_PACKAGE_VALUE') {
      return rows.reduce(
        (total, row) => total.add(new Prisma.Decimal(row.price)),
        new Prisma.Decimal(0),
      );
    }

    let highest = new Prisma.Decimal(0);
    for (const row of rows) {
      const value = new Prisma.Decimal(row.price);
      if (value.gt(highest)) highest = value;
    }
    return highest;
  }

  private async insertRun(
    transaction: Prisma.TransactionClient,
    source: SourceSubscriptionRow,
    plan: CommissionPlanRow | null,
    outcome: CommissionRunOutcome,
    routeSnapshot: unknown,
  ) {
    const id = randomUUID();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO referral_commission_runs (
        id, sourceSubscriptionId, sourceDepositId, purchaserUserId,
        commissionPlanVersionId, sourcePackageCode, sourcePackageDisplayName,
        sourcePackageValue, currency, sourceActivatedAt, outcome,
        routeSnapshot, processedAt, createdAt
      ) VALUES (
        ${id}, ${source.id}, ${source.sourceDepositId}, ${source.userId},
        ${plan?.id ?? null}, ${source.packageCode}, ${source.packageDisplayName},
        ${this.decimalString(source.price)}, ${source.currency}, ${source.activatedAt},
        ${outcome}, ${JSON.stringify(routeSnapshot)},
        CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
      )
    `);
    const rows = await transaction.$queryRaw<CommissionRunRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_runs
      WHERE id = ${id}
      LIMIT 1
    `);
    const run = rows[0];
    if (!run) {
      throw new ServiceUnavailableException(
        'Referral commission run could not be read after creation.',
      );
    }
    return run;
  }

  private async insertEvent(
    transaction: Prisma.TransactionClient,
    input: {
      runId: string;
      source: SourceSubscriptionRow;
      plan: CommissionPlanRow;
      receiverUserId: string;
      level: number;
      packageMatchingEnabled: boolean;
      receiverPackageBasis: string;
      eligibleBase: string;
      ratePercent: string;
      commissionAmount: string;
      status: CommissionEventStatus;
      ineligibilityReason: string | null;
      ledgerTransactionId: string | null;
      availableAt: Date | null;
    },
  ) {
    const id = randomUUID();
    const sourceKey = referralCommissionSourceKey(
      input.source.id,
      input.level,
      input.receiverUserId,
    );
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO referral_commission_events (
        id, runId, sourceSubscriptionId, receiverUserId, purchaserUserId,
        commissionPlanVersionId, level, sourceKey, currency,
        sourcePackageValue, receiverPackageBasis, packageMatchingEnabled,
        eligibleBase, ratePercent, commissionAmount, releaseMode, status,
        ineligibilityReason, ledgerTransactionId, availableAt, createdAt
      ) VALUES (
        ${id}, ${input.runId}, ${input.source.id}, ${input.receiverUserId},
        ${input.source.userId}, ${input.plan.id}, ${input.level}, ${sourceKey},
        ${input.source.currency}, ${this.decimalString(input.source.price)},
        ${input.receiverPackageBasis}, ${input.packageMatchingEnabled},
        ${input.eligibleBase}, ${input.ratePercent}, ${input.commissionAmount},
        ${input.plan.releaseMode}, ${input.status}, ${input.ineligibilityReason},
        ${input.ledgerTransactionId}, ${input.availableAt}, CURRENT_TIMESTAMP(3)
      )
    `);
    const rows = await transaction.$queryRaw<CommissionEventRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_events
      WHERE id = ${id}
      LIMIT 1
    `);
    const event = rows[0];
    if (!event) {
      throw new ServiceUnavailableException(
        'Referral commission event could not be read after creation.',
      );
    }
    return event;
  }

  private async postImmediateCommission(
    transaction: Prisma.TransactionClient,
    sourceKey: string,
    source: SourceSubscriptionRow,
    plan: CommissionPlanRow,
    routeNode: RouteNode,
    receiverBasis: Prisma.Decimal,
    eligibleBase: Prisma.Decimal,
    rate: Prisma.Decimal,
    amount: Prisma.Decimal,
    actor: AuthenticatedUser,
  ) {
    if (plan.releaseMode !== 'IMMEDIATE') {
      throw new ServiceUnavailableException(
        'Configured commission release mode requires its dedicated release engine.',
      );
    }

    const currency = source.currency.toUpperCase();
    const expense = await this.ensureLedgerAccount(
      transaction,
      referralCommissionExpenseAccountKey(currency),
      'SYSTEM',
      null,
      'REFERRAL_COMMISSION_EXPENSE',
      currency,
      'DEBIT',
    );
    const receiver = await this.ensureLedgerAccount(
      transaction,
      userWalletAccountKey(routeNode.receiverUserId, 'REFERRAL_COMMISSION', currency),
      'USER',
      routeNode.receiverUserId,
      'REFERRAL_COMMISSION',
      currency,
      'CREDIT',
    );
    const transactionId = randomUUID();

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_transactions (
        id, kind, sourceKey, sourceType, sourceId, currency,
        postedByUserId, description, metadata, postedAt, createdAt
      ) VALUES (
        ${transactionId}, 'REFERRAL_COMMISSION_CREDIT', ${sourceKey},
        'PACKAGE_SUBSCRIPTION', ${source.id}, ${currency}, ${actor.id},
        ${`Referral commission L${routeNode.level} from ${source.packageDisplayName}.`},
        ${JSON.stringify({
          sourceSubscriptionId: source.id,
          purchaserUserId: source.userId,
          receiverUserId: routeNode.receiverUserId,
          commissionPlanVersionId: plan.id,
          commissionPlanVersionNumber: plan.versionNumber,
          level: routeNode.level,
          sourcePackageValue: this.decimalString(source.price),
          receiverPackageBasis: receiverBasis.toFixed(8),
          eligibleBase: eligibleBase.toFixed(8),
          ratePercent: rate.toFixed(6),
          commissionAmount: amount.toFixed(8),
          currency,
        })},
        CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
      )
    `);

    await this.insertLedgerEntry(
      transaction,
      transactionId,
      expense.id,
      'DEBIT',
      amount.toFixed(8),
      `Referral commission expense for L${routeNode.level}.`,
    );
    await this.insertLedgerEntry(
      transaction,
      transactionId,
      receiver.id,
      'CREDIT',
      amount.toFixed(8),
      `Referral commission received from ${source.packageDisplayName}.`,
    );
    await this.assertBalanced(transaction, transactionId);
    await this.applyBalance(transaction, expense, 'DEBIT', amount.toFixed(8));
    await this.applyBalance(transaction, receiver, 'CREDIT', amount.toFixed(8));
    return transactionId;
  }

  private async ensureLedgerAccount(
    transaction: Prisma.TransactionClient,
    accountKey: string,
    ownerType: 'SYSTEM' | 'USER',
    ownerUserId: string | null,
    bucket: LedgerAccountRow['bucket'],
    currency: string,
    normalSide: 'DEBIT' | 'CREDIT',
  ) {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide, createdAt
      ) VALUES (
        ${randomUUID()}, ${accountKey}, ${ownerType}, ${ownerUserId}, ${bucket},
        ${currency}, ${normalSide}, CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);
    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
      FROM ledger_accounts
      WHERE accountKey = ${accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];
    if (!account) {
      throw new ServiceUnavailableException('Commission ledger account is missing.');
    }
    if (
      account.ownerType !== ownerType ||
      account.ownerUserId !== ownerUserId ||
      account.bucket !== bucket ||
      account.currency !== currency ||
      account.normalSide !== normalSide
    ) {
      throw new ServiceUnavailableException(
        'Commission ledger account semantics are inconsistent.',
      );
    }
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
        ${randomUUID()}, ${transactionId}, ${accountId}, ${side},
        ${amount}, ${memo}, CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async assertBalanced(
    transaction: Prisma.TransactionClient,
    transactionId: string,
  ) {
    const rows = await transaction.$queryRaw<LedgerEntryAmountRow[]>(Prisma.sql`
      SELECT side, amount
      FROM ledger_entries
      WHERE transactionId = ${transactionId}
      ORDER BY createdAt ASC, id ASC
    `);
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    for (const row of rows) {
      const amount = new Prisma.Decimal(row.amount);
      if (row.side === 'DEBIT') debit = debit.add(amount);
      else credit = credit.add(amount);
    }
    if (rows.length < 2 || debit.lte(0) || !debit.eq(credit)) {
      throw new ServiceUnavailableException(
        'Referral commission ledger transaction is not balanced.',
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
      throw new ServiceUnavailableException(
        'Referral commission balance read model could not be updated.',
      );
    }
  }

  private async findRun(
    transaction: Prisma.TransactionClient,
    sourceSubscriptionId: string,
  ) {
    const rows = await transaction.$queryRaw<CommissionRunRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_runs
      WHERE sourceSubscriptionId = ${sourceSubscriptionId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async runSnapshotWithEvents(
    transaction: Prisma.TransactionClient,
    run: CommissionRunRow,
    created: boolean,
  ) {
    const events = await transaction.$queryRaw<CommissionEventRow[]>(Prisma.sql`
      SELECT *
      FROM referral_commission_events
      WHERE runId = ${run.id}
      ORDER BY level ASC
    `);
    return {
      created,
      run: this.runSnapshot(run),
      events: events.map((event) => this.eventSnapshot(event)),
    };
  }

  private async auditRun(
    transaction: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    context: RequestContext,
    operation: CommissionAuditOperation,
    run: CommissionRunRow,
    events: CommissionEventRow[],
    extra: Record<string, unknown>,
  ) {
    const availableTotal = events.reduce(
      (total, event) =>
        event.status === 'AVAILABLE'
          ? total.add(new Prisma.Decimal(event.commissionAmount))
          : total,
      new Prisma.Decimal(0),
    );
    await transaction.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'CREATE',
        entityType: 'ReferralCommissionRun',
        entityId: run.id,
        description: 'Referral commission processing completed for package subscription.',
        metadata: {
          operation,
          sourceSubscriptionId: run.sourceSubscriptionId,
          purchaserUserId: run.purchaserUserId,
          commissionPlanVersionId: run.commissionPlanVersionId,
          outcome: run.outcome,
          currency: run.currency,
          availableTotal: availableTotal.toFixed(8),
          eventCount: events.length,
          ...extra,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  private runSnapshot(row: CommissionRunRow) {
    return {
      id: row.id,
      sourceSubscriptionId: row.sourceSubscriptionId,
      sourceDepositId: row.sourceDepositId,
      purchaserUserId: row.purchaserUserId,
      commissionPlanVersionId: row.commissionPlanVersionId,
      sourcePackageCode: row.sourcePackageCode,
      sourcePackageDisplayName: row.sourcePackageDisplayName,
      sourcePackageValue: this.decimalString(row.sourcePackageValue),
      currency: row.currency,
      sourceActivatedAt: row.sourceActivatedAt,
      outcome: row.outcome,
      routeSnapshot: row.routeSnapshot,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
    };
  }

  private eventSnapshot(row: CommissionEventRow) {
    return {
      id: row.id,
      runId: row.runId,
      sourceSubscriptionId: row.sourceSubscriptionId,
      receiverUserId: row.receiverUserId,
      receiverUsername: row.receiverUsername,
      receiverEmail: row.receiverEmail,
      purchaserUserId: row.purchaserUserId,
      purchaserUsername: row.purchaserUsername,
      purchaserEmail: row.purchaserEmail,
      commissionPlanVersionId: row.commissionPlanVersionId,
      level: row.level,
      sourceKey: row.sourceKey,
      sourcePackageDisplayName: row.sourcePackageDisplayName,
      currency: row.currency,
      sourcePackageValue: this.decimalString(row.sourcePackageValue),
      receiverPackageBasis: this.decimalString(row.receiverPackageBasis),
      packageMatchingEnabled: Boolean(row.packageMatchingEnabled),
      eligibleBase: this.decimalString(row.eligibleBase),
      ratePercent: this.rateString(row.ratePercent),
      commissionAmount: this.decimalString(row.commissionAmount),
      releaseMode: row.releaseMode,
      status: row.status,
      ineligibilityReason: row.ineligibilityReason,
      ledgerTransactionId: row.ledgerTransactionId,
      availableAt: row.availableAt,
      createdAt: row.createdAt,
    };
  }

  private parseDate(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO-8601 date.`);
    }
    return parsed;
  }

  private decimalString(value: DecimalValue) {
    return new Prisma.Decimal(value).toFixed(8);
  }

  private rateString(value: DecimalValue) {
    return new Prisma.Decimal(value).toFixed(6);
  }

  private countNumber(value: CountRow['total'] | undefined) {
    return value === undefined ? 0 : Number(value);
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
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
      }
    }
    throw lastError;
  }
}
