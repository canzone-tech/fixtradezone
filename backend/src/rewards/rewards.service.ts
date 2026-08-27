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
  packageRewardExpenseAccountKey,
  packageRewardSourceKey,
  userWalletAccountKey,
} from '../wallet/wallet.constants';
import type {
  AdminRewardEventQueryDto,
  AdminRewardStateQueryDto,
  CreateRewardPolicyDraftDto,
  PublishRewardPolicyDto,
  RewardPageQueryDto,
  UpdateRewardPolicyDto,
} from './dto/reward.dto';
import {
  addLocalDays,
  deriveRewardPosition,
  deterministicRateInRange,
  localDateForInstant,
  localDateStartUtc,
  moneyRoundDown,
  moneyString,
  rateString,
} from './reward-calculation';
import {
  MAX_REWARD_CATCHUP_EVENTS_PER_CALL,
  REWARD_AUDIT_OPERATIONS,
  RWD01_EXECUTABLE_POLICY,
  RWD01_EXECUTABLE_SUBSCRIPTION_TERMS,
  type ExistingSubscriptionRolloutMode,
  type PackageRewardCompletionReason,
  type PackageRewardStateStatus,
  type RewardPolicyStatus,
} from './rewards.constants';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const DUE_BATCH_LIMIT = 100;

type DecimalValue = Prisma.Decimal | number | string;
type RewardActor = Pick<AuthenticatedUser, 'id'> | null;
type RewardAuditOperation =
  (typeof REWARD_AUDIT_OPERATIONS)[keyof typeof REWARD_AUDIT_OPERATIONS];

interface CountRow {
  total: bigint | number | string;
}

interface RewardPolicyRow {
  id: string;
  versionNumber: number;
  status: RewardPolicyStatus;
  revision: number;
  existingSubscriptionRolloutMode: ExistingSubscriptionRolloutMode;
  packageRewardCountsTowardCap: boolean | number;
  referralCommissionCountsTowardCap: boolean | number;
  teamCommissionCountsTowardCap: boolean | number;
  awardRewardCountsTowardCap: boolean | number;
  otherIncomeCountsTowardCap: boolean | number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  publishedAt: Date | null;
  clonedFromPolicyVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RewardSubscriptionRow {
  id: string;
  userId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  price: DecimalValue;
  currency: string;
  settlementTimezone: string;
  rewardRateMode: 'FIXED' | 'RANDOM_RANGE' | 'MANUAL' | 'RULE_BASED';
  fixedRewardRate: DecimalValue | null;
  minimumRewardRate: DecimalValue | null;
  maximumRewardRate: DecimalValue | null;
  rewardRateMeaning: 'GROSS_BEFORE_SPLIT' | 'USER_NET_AFTER_SPLIT';
  capBasis: 'TOTAL_RETURN' | 'PROFIT_ONLY';
  capMultiplier: DecimalValue;
  principalTreatment:
    | 'RETURN_SEPARATELY'
    | 'INCLUDED_IN_TOTAL_RETURN'
    | 'NON_REFUNDABLE_PACKAGE_VALUE';
  goalDays: number;
  cycleDays: number;
  rewardStartMode:
    | 'SAME_DAY'
    | 'NEXT_CALENDAR_DAY'
    | 'AFTER_FULL_INTERVAL'
    | 'CONFIGURED_START_TIME'
    | 'NEXT_CYCLE_START';
  rewardFrequency:
    | 'DAILY_CALENDAR'
    | 'CONFIGURED_DAYS'
    | 'PER_CYCLE'
    | 'PER_EVENT';
  cycleDayMode: 'CALENDAR_DAYS' | 'ELIGIBLE_EARNING_DAYS';
  rewardDayMode: 'EVERY_DAY' | 'SELECTED_WEEKDAYS' | 'CUSTOM_CALENDAR';
  cycleEndAction:
    | 'COMPLETE_PACKAGE'
    | 'AUTO_START_NEXT_CYCLE'
    | 'MANUAL_RESTART'
    | 'PAUSE_UNTIL_CONDITION';
  capReachedAction:
    | 'COMPLETE_PACKAGE'
    | 'STOP_EARNINGS_KEEP_ACTIVE'
    | 'AUTO_RENEW'
    | 'MANUAL_RENEW'
    | 'PAUSE';
  status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
  activatedAt: Date;
  scheduledEndAt: Date;
  completedAt: Date | null;
}

interface RewardStateRow {
  subscriptionId: string;
  userId: string;
  rewardCapPolicyVersionId: string;
  currency: string;
  packageValue: DecimalValue;
  capBasis: string;
  capMultiplier: DecimalValue;
  principalTreatment: string;
  capLimit: DecimalValue;
  capConsumed: DecimalValue;
  packageRewardCountsTowardCap: boolean | number;
  referralCommissionCountsTowardCap: boolean | number;
  teamCommissionCountsTowardCap: boolean | number;
  awardRewardCountsTowardCap: boolean | number;
  otherIncomeCountsTowardCap: boolean | number;
  nextRewardLocalDate: Date | string;
  nextRewardAt: Date;
  nextRewardDayNumber: number;
  nextCycleNumber: number;
  nextCycleDay: number;
  settledRewardCount: number;
  status: PackageRewardStateStatus;
  completionReason: PackageRewardCompletionReason | null;
  blockedReason: string | null;
  revision: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  username?: string;
  email?: string | null;
  packageDisplayName?: string;
}

interface RewardEventRow {
  id: string;
  sourceKey: string;
  subscriptionId: string;
  userId: string;
  rewardCapPolicyVersionId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  packageValue: DecimalValue;
  currency: string;
  rewardLocalDate: Date | string;
  rewardDayNumber: number;
  cycleNumber: number;
  cycleDay: number;
  settlementTimezone: string;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  rewardRateMode: string;
  rewardRateMeaning: string;
  selectedRate: DecimalValue;
  calculatedReward: DecimalValue;
  postedReward: DecimalValue;
  capBasis: string;
  capMultiplier: DecimalValue;
  principalTreatment: string;
  capLimit: DecimalValue;
  capConsumedBefore: DecimalValue;
  capConsumedAfter: DecimalValue;
  clippedToCap: boolean | number;
  existingSubscriptionRolloutMode: string;
  packageRewardCountsTowardCap: boolean | number;
  referralCommissionCountsTowardCap: boolean | number;
  teamCommissionCountsTowardCap: boolean | number;
  awardRewardCountsTowardCap: boolean | number;
  otherIncomeCountsTowardCap: boolean | number;
  cycleDays: number;
  goalDays: number;
  cycleEndAction: string;
  capReachedAction: string;
  ledgerTransactionId: string;
  completionReason: PackageRewardCompletionReason | null;
  postedAt: Date;
  createdAt: Date;
  username?: string;
  email?: string | null;
}

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: 'PACKAGE_EARNINGS' | 'PACKAGE_REWARD_EXPENSE';
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

interface LedgerEntryAmountRow {
  side: 'DEBIT' | 'CREDIT';
  amount: DecimalValue;
}

interface ReconciliationRow {
  subscriptionId: string;
  userId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  currency: string;
  packageValue: DecimalValue;
  activatedAt: Date;
  stateStatus: PackageRewardStateStatus | null;
  nextRewardAt: Date | null;
  blockedReason: string | null;
}

interface WorkerHealth {
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  lastSummary: RewardBatchSummary | null;
}

interface RewardBatchSummary {
  asOf: string;
  initialized: number;
  processedSubscriptions: number;
  createdEvents: number;
  completedSubscriptions: number;
  blockedSubscriptions: number;
  remainingDue: number;
}

interface EnsureStateResult {
  state: RewardStateRow | null;
  initialized: boolean;
  noEffectivePolicy: boolean;
}

interface ProcessOneResult {
  createdEvent: boolean;
  event: RewardEventRow | null;
  state: RewardStateRow | null;
  due: boolean;
  terminal: boolean;
}

@Injectable()
export class RewardsService {
  private readonly workerHealth: WorkerHealth = {
    lastStartedAt: null,
    lastCompletedAt: null,
    lastErrorAt: null,
    lastError: null,
    lastSummary: null,
  };

  constructor(private readonly prisma: PrismaService) {}

  async listPolicies() {
    const rows = await this.prisma.$queryRaw<RewardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM reward_cap_policy_versions
      ORDER BY versionNumber DESC
    `);
    return { policies: rows.map((row) => this.policySnapshot(row)) };
  }

  async getPolicy(policyVersionId: string) {
    return this.policySnapshot(
      await this.requirePolicy(this.prisma, policyVersionId, false),
    );
  }

  async createPolicyDraft(
    dto: CreateRewardPolicyDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const drafts = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id
        FROM reward_cap_policy_versions
        WHERE status = 'DRAFT'
        LIMIT 1
        FOR UPDATE
      `);
      if (drafts.length > 0) {
        throw new ConflictException(
          'A reward/cap policy draft already exists. Publish or finish it first.',
        );
      }

      const source = await this.requirePolicy(
        transaction,
        dto.sourcePolicyVersionId,
        true,
      );
      if (source.status !== 'PUBLISHED') {
        throw new ConflictException(
          'Only a published reward/cap policy may be cloned.',
        );
      }

      const maxRows = await transaction.$queryRaw<
        { maxVersion: number | null }[]
      >(Prisma.sql`
        SELECT MAX(versionNumber) AS maxVersion
        FROM reward_cap_policy_versions
      `);
      const versionNumber = (maxRows[0]?.maxVersion ?? 0) + 1;
      const id = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO reward_cap_policy_versions (
          id, versionNumber, status, revision,
          existingSubscriptionRolloutMode,
          packageRewardCountsTowardCap,
          referralCommissionCountsTowardCap,
          teamCommissionCountsTowardCap,
          awardRewardCountsTowardCap,
          otherIncomeCountsTowardCap,
          effectiveFrom, effectiveTo, publishedAt,
          clonedFromPolicyVersionId,
          createdByUserId, updatedByUserId, publishedByUserId,
          createdAt, updatedAt
        ) VALUES (
          ${id}, ${versionNumber}, 'DRAFT', 1,
          ${source.existingSubscriptionRolloutMode},
          ${Boolean(source.packageRewardCountsTowardCap)},
          ${Boolean(source.referralCommissionCountsTowardCap)},
          ${Boolean(source.teamCommissionCountsTowardCap)},
          ${Boolean(source.awardRewardCountsTowardCap)},
          ${Boolean(source.otherIncomeCountsTowardCap)},
          NULL, NULL, NULL,
          ${source.id},
          ${actor.id}, ${actor.id}, NULL,
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'RewardCapPolicyVersion',
          entityId: id,
          description: 'Published reward/cap policy cloned into a new draft.',
          metadata: {
            operation: REWARD_AUDIT_OPERATIONS.CLONE_POLICY_DRAFT,
            sourcePolicyVersionId: source.id,
            versionNumber,
            reason: dto.reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, id, false),
      );
    });
  }

  async updatePolicyDraft(
    policyVersionId: string,
    dto: UpdateRewardPolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const current = await this.requirePolicy(
        transaction,
        policyVersionId,
        true,
      );
      if (current.status !== 'DRAFT') {
        throw new ConflictException('Published reward/cap policy is immutable.');
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Reward/cap policy draft changed. Reload before saving.',
        );
      }

      const next = {
        existingSubscriptionRolloutMode:
          dto.existingSubscriptionRolloutMode ??
          current.existingSubscriptionRolloutMode,
        packageRewardCountsTowardCap:
          dto.packageRewardCountsTowardCap ??
          Boolean(current.packageRewardCountsTowardCap),
        referralCommissionCountsTowardCap:
          dto.referralCommissionCountsTowardCap ??
          Boolean(current.referralCommissionCountsTowardCap),
        teamCommissionCountsTowardCap:
          dto.teamCommissionCountsTowardCap ??
          Boolean(current.teamCommissionCountsTowardCap),
        awardRewardCountsTowardCap:
          dto.awardRewardCountsTowardCap ??
          Boolean(current.awardRewardCountsTowardCap),
        otherIncomeCountsTowardCap:
          dto.otherIncomeCountsTowardCap ??
          Boolean(current.otherIncomeCountsTowardCap),
      };

      await transaction.$executeRaw(Prisma.sql`
        UPDATE reward_cap_policy_versions
        SET
          revision = revision + 1,
          existingSubscriptionRolloutMode = ${next.existingSubscriptionRolloutMode},
          packageRewardCountsTowardCap = ${next.packageRewardCountsTowardCap},
          referralCommissionCountsTowardCap = ${next.referralCommissionCountsTowardCap},
          teamCommissionCountsTowardCap = ${next.teamCommissionCountsTowardCap},
          awardRewardCountsTowardCap = ${next.awardRewardCountsTowardCap},
          otherIncomeCountsTowardCap = ${next.otherIncomeCountsTowardCap},
          updatedByUserId = ${actor.id},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${current.id}
          AND status = 'DRAFT'
          AND revision = ${current.revision}
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'RewardCapPolicyVersion',
          entityId: current.id,
          description: 'Reward/cap policy draft updated.',
          metadata: {
            operation: REWARD_AUDIT_OPERATIONS.UPDATE_POLICY_DRAFT,
            previousRevision: current.revision,
            newRevision: current.revision + 1,
            reason: dto.reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, current.id, false),
      );
    });
  }

  async publishPolicy(
    policyVersionId: string,
    dto: PublishRewardPolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const current = await this.requirePolicy(
        transaction,
        policyVersionId,
        true,
      );
      if (current.status !== 'DRAFT') {
        throw new ConflictException('Reward/cap policy is already published.');
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Reward/cap policy draft changed. Reload before publishing.',
        );
      }
      this.assertExecutablePolicy(current);

      const now = new Date();
      const effectiveFrom = dto.effectiveFrom
        ? this.parseDate(dto.effectiveFrom, 'effectiveFrom')
        : now;
      const effectiveTo = dto.effectiveTo
        ? this.parseDate(dto.effectiveTo, 'effectiveTo')
        : null;

      if (dto.effectiveFrom && effectiveFrom.getTime() < now.getTime()) {
        throw new BadRequestException(
          'Reward/cap policy effectiveFrom cannot be backdated.',
        );
      }
      if (effectiveTo && effectiveTo <= effectiveFrom) {
        throw new BadRequestException('effectiveTo must be after effectiveFrom.');
      }

      const overlaps = await transaction.$queryRaw<RewardPolicyRow[]>(Prisma.sql`
        SELECT *
        FROM reward_cap_policy_versions
        WHERE status = 'PUBLISHED'
          AND (effectiveTo IS NULL OR effectiveTo > ${effectiveFrom})
          AND (${effectiveTo} IS NULL OR effectiveFrom < ${effectiveTo})
        ORDER BY effectiveFrom ASC
        FOR UPDATE
      `);

      if (overlaps.length > 1) {
        throw new ConflictException(
          'Published reward/cap policy ranges overlap; resolve configuration first.',
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
            'Reward/cap policy effective range overlaps an existing publication.',
          );
        }
        await transaction.$executeRaw(Prisma.sql`
          UPDATE reward_cap_policy_versions
          SET effectiveTo = ${effectiveFrom}, updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${predecessor.id}
        `);
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE reward_cap_policy_versions
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
          'Reward/cap policy changed concurrently. Reload before publishing.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'RewardCapPolicyVersion',
          entityId: current.id,
          description: 'Reward/cap policy published.',
          metadata: {
            operation: REWARD_AUDIT_OPERATIONS.PUBLISH_POLICY,
            reason: dto.reason,
            versionNumber: current.versionNumber,
            existingSubscriptionRolloutMode:
              current.existingSubscriptionRolloutMode,
            effectiveFrom: effectiveFrom.toISOString(),
            effectiveTo: effectiveTo?.toISOString() ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, current.id, false),
      );
    });
  }

  async getMyRewards(userId: string, query: RewardPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const states = await this.prisma.$queryRaw<RewardStateRow[]>(Prisma.sql`
      SELECT prs.*, ups.packageDisplayName
      FROM package_reward_states prs
      INNER JOIN user_package_subscriptions ups
        ON ups.id = prs.subscriptionId
      WHERE prs.userId = ${userId}
      ORDER BY prs.createdAt DESC, prs.subscriptionId DESC
    `);
    const events = await this.prisma.$queryRaw<RewardEventRow[]>(Prisma.sql`
      SELECT pre.*
      FROM package_reward_events pre
      WHERE pre.userId = ${userId}
      ORDER BY pre.postedAt DESC, pre.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM package_reward_events
      WHERE userId = ${userId}
    `);

    return {
      states: states.map((row) => this.stateSnapshot(row)),
      events: events.map((row) => this.eventSnapshot(row, false)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listEvents(query: AdminRewardEventQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND pre.userId = ${query.userId}`
      : Prisma.empty;
    const subscriptionFilter = query.subscriptionId
      ? Prisma.sql`AND pre.subscriptionId = ${query.subscriptionId}`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND pre.currency = ${query.currency}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RewardEventRow[]>(Prisma.sql`
      SELECT pre.*, u.username, u.email
      FROM package_reward_events pre
      INNER JOIN users u ON u.id = pre.userId
      WHERE 1 = 1
        ${userFilter}
        ${subscriptionFilter}
        ${currencyFilter}
      ORDER BY pre.postedAt DESC, pre.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM package_reward_events pre
      WHERE 1 = 1
        ${userFilter}
        ${subscriptionFilter}
        ${currencyFilter}
    `);

    return {
      rewards: rows.map((row) => this.eventSnapshot(row, true)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listStates(query: AdminRewardStateQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND prs.userId = ${query.userId}`
      : Prisma.empty;
    const statusFilter = query.status
      ? Prisma.sql`AND prs.status = ${query.status}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RewardStateRow[]>(Prisma.sql`
      SELECT prs.*, u.username, u.email, ups.packageDisplayName
      FROM package_reward_states prs
      INNER JOIN users u ON u.id = prs.userId
      INNER JOIN user_package_subscriptions ups
        ON ups.id = prs.subscriptionId
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
      ORDER BY
        FIELD(prs.status, 'BLOCKED', 'ACTIVE', 'COMPLETED'),
        prs.nextRewardAt ASC,
        prs.subscriptionId ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM package_reward_states prs
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
    `);

    return {
      states: rows.map((row) => this.stateSnapshot(row, true)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listReconciliation(query: RewardPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`
      SELECT
        ups.id AS subscriptionId,
        ups.userId,
        u.username,
        u.email,
        ups.packageDisplayName,
        ups.currency,
        ups.price AS packageValue,
        ups.activatedAt,
        prs.status AS stateStatus,
        prs.nextRewardAt,
        prs.blockedReason
      FROM user_package_subscriptions ups
      INNER JOIN users u ON u.id = ups.userId
      LEFT JOIN package_reward_states prs
        ON prs.subscriptionId = ups.id
      WHERE ups.status = 'ACTIVE'
        AND (
          prs.subscriptionId IS NULL
          OR prs.status = 'BLOCKED'
          OR (prs.status = 'ACTIVE' AND prs.nextRewardAt <= CURRENT_TIMESTAMP(3))
        )
      ORDER BY
        CASE WHEN prs.status = 'BLOCKED' THEN 0 ELSE 1 END,
        COALESCE(prs.nextRewardAt, ups.activatedAt) ASC,
        ups.id ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions ups
      LEFT JOIN package_reward_states prs
        ON prs.subscriptionId = ups.id
      WHERE ups.status = 'ACTIVE'
        AND (
          prs.subscriptionId IS NULL
          OR prs.status = 'BLOCKED'
          OR (prs.status = 'ACTIVE' AND prs.nextRewardAt <= CURRENT_TIMESTAMP(3))
        )
    `);

    return {
      subscriptions: rows.map((row) => ({
        subscriptionId: row.subscriptionId,
        userId: row.userId,
        username: row.username,
        email: row.email,
        packageDisplayName: row.packageDisplayName,
        currency: row.currency,
        packageValue: moneyString(row.packageValue),
        activatedAt: row.activatedAt,
        stateStatus: row.stateStatus ?? 'UNINITIALIZED',
        nextRewardAt: row.nextRewardAt,
        blockedReason: row.blockedReason,
      })),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  getWorkerHealth() {
    return { ...this.workerHealth };
  }

  noteWorkerStart() {
    this.workerHealth.lastStartedAt = new Date();
  }

  noteWorkerSuccess(summary: RewardBatchSummary) {
    this.workerHealth.lastCompletedAt = new Date();
    this.workerHealth.lastError = null;
    this.workerHealth.lastSummary = summary;
  }

  noteWorkerFailure(error: unknown) {
    this.workerHealth.lastErrorAt = new Date();
    this.workerHealth.lastError =
      error instanceof Error ? error.message : 'Unknown reward worker error.';
  }

  async reconcileSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.processSubscriptionDue(
      subscriptionId,
      new Date(),
      actor,
      context,
      REWARD_AUDIT_OPERATIONS.RECONCILE_SUBSCRIPTION,
    );
  }

  async processDueBatch(
    actor: RewardActor,
    context: RequestContext = {},
    automatic = false,
  ): Promise<RewardBatchSummary> {
    const asOf = new Date();
    let initialized = 0;
    let processedSubscriptions = 0;
    let createdEvents = 0;
    let completedSubscriptions = 0;
    let blockedSubscriptions = 0;

    const uninitialized = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT ups.id
      FROM user_package_subscriptions ups
      LEFT JOIN package_reward_states prs ON prs.subscriptionId = ups.id
      WHERE ups.status = 'ACTIVE'
        AND prs.subscriptionId IS NULL
      ORDER BY ups.activatedAt ASC, ups.id ASC
      LIMIT ${DUE_BATCH_LIMIT}
    `);

    for (const row of uninitialized) {
      const ensured = await this.ensureState(
        row.id,
        asOf,
        actor,
        context,
        automatic
          ? REWARD_AUDIT_OPERATIONS.AUTO_PROCESS_DUE_BATCH
          : REWARD_AUDIT_OPERATIONS.PROCESS_DUE_BATCH,
      );
      if (ensured.initialized) initialized += 1;
      if (ensured.state?.status === 'BLOCKED') blockedSubscriptions += 1;
      if (ensured.state?.status === 'COMPLETED') completedSubscriptions += 1;
    }

    const dueRows = await this.prisma.$queryRaw<{ subscriptionId: string }[]>(
      Prisma.sql`
        SELECT subscriptionId
        FROM package_reward_states
        WHERE status = 'ACTIVE'
          AND nextRewardAt <= ${asOf}
        ORDER BY nextRewardAt ASC, subscriptionId ASC
        LIMIT ${DUE_BATCH_LIMIT}
      `,
    );

    for (const row of dueRows) {
      const result = await this.processSubscriptionDue(
        row.subscriptionId,
        asOf,
        actor,
        context,
        automatic
          ? REWARD_AUDIT_OPERATIONS.AUTO_PROCESS_DUE_BATCH
          : REWARD_AUDIT_OPERATIONS.PROCESS_DUE_BATCH,
      );
      processedSubscriptions += 1;
      createdEvents += result.events.length;
      if (result.state?.status === 'COMPLETED') completedSubscriptions += 1;
      if (result.state?.status === 'BLOCKED') blockedSubscriptions += 1;
    }

    const remainingRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM package_reward_states
      WHERE status = 'ACTIVE'
        AND nextRewardAt <= ${asOf}
    `);

    return {
      asOf: asOf.toISOString(),
      initialized,
      processedSubscriptions,
      createdEvents,
      completedSubscriptions,
      blockedSubscriptions,
      remainingDue: this.countNumber(remainingRows[0]?.total),
    };
  }

  async processSubscriptionDue(
    subscriptionId: string,
    asOf: Date,
    actor: RewardActor,
    context: RequestContext = {},
    operation: RewardAuditOperation = REWARD_AUDIT_OPERATIONS.RECONCILE_SUBSCRIPTION,
  ) {
    const ensured = await this.ensureState(
      subscriptionId,
      asOf,
      actor,
      context,
      operation,
    );
    if (!ensured.state) {
      return {
        initialized: false,
        noEffectivePolicy: ensured.noEffectivePolicy,
        events: [],
        state: null,
        message: ensured.noEffectivePolicy
          ? 'No published reward/cap policy applies to this subscription yet.'
          : 'Package subscription is not eligible for reward state initialization.',
      };
    }

    const events: ReturnType<RewardsService['eventSnapshot']>[] = [];
    let state = ensured.state;

    for (
      let index = 0;
      index < MAX_REWARD_CATCHUP_EVENTS_PER_CALL;
      index += 1
    ) {
      if (state.status !== 'ACTIVE' || state.nextRewardAt > asOf) break;
      const result = await this.processOneDueReward(
        subscriptionId,
        asOf,
        actor,
        context,
        operation,
      );
      if (result.event && result.createdEvent) {
        events.push(this.eventSnapshot(result.event, false));
      }
      if (result.state) state = result.state;
      if (!result.due || result.terminal || !result.createdEvent) break;
    }

    return {
      initialized: ensured.initialized,
      noEffectivePolicy: false,
      events,
      state: this.stateSnapshot(state),
      catchupLimitReached:
        events.length === MAX_REWARD_CATCHUP_EVENTS_PER_CALL &&
        state.status === 'ACTIVE' &&
        state.nextRewardAt <= asOf,
      message:
        events.length > 0
          ? `${events.length} package reward event(s) posted.`
          : state.status === 'BLOCKED'
            ? `Reward processing is blocked: ${state.blockedReason ?? 'unsupported configuration'}.`
            : state.status === 'COMPLETED'
              ? `Package reward lifecycle is completed: ${state.completionReason ?? 'terminal'}.`
              : `No package reward is due before ${state.nextRewardAt.toISOString()}.`,
    };
  }

  private async ensureState(
    subscriptionId: string,
    asOf: Date,
    actor: RewardActor,
    context: RequestContext,
    operation: RewardAuditOperation,
  ): Promise<EnsureStateResult> {
    return this.runSerializable(async (transaction) => {
      const subscription = await this.requireSubscription(
        transaction,
        subscriptionId,
        true,
      );
      const existing = await this.findState(transaction, subscriptionId, true);
      if (existing) {
        return {
          state: existing,
          initialized: false,
          noEffectivePolicy: false,
        };
      }
      if (subscription.status !== 'ACTIVE') {
        return { state: null, initialized: false, noEffectivePolicy: false };
      }

      const policy = await this.resolvePolicyForSubscription(
        transaction,
        subscription.activatedAt,
        asOf,
      );
      if (!policy) {
        return { state: null, initialized: false, noEffectivePolicy: true };
      }

      const initialization = this.buildInitialState(
        subscription,
        policy,
        asOf,
      );

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO package_reward_states (
          subscriptionId, userId, rewardCapPolicyVersionId,
          currency, packageValue, capBasis, capMultiplier, principalTreatment,
          capLimit, capConsumed,
          packageRewardCountsTowardCap,
          referralCommissionCountsTowardCap,
          teamCommissionCountsTowardCap,
          awardRewardCountsTowardCap,
          otherIncomeCountsTowardCap,
          nextRewardLocalDate, nextRewardAt,
          nextRewardDayNumber, nextCycleNumber, nextCycleDay,
          settledRewardCount, status, completionReason, blockedReason,
          revision, completedAt, createdAt, updatedAt
        ) VALUES (
          ${subscription.id}, ${subscription.userId}, ${policy.id},
          ${subscription.currency}, ${moneyString(subscription.price)},
          ${subscription.capBasis}, ${new Prisma.Decimal(subscription.capMultiplier).toFixed(4)},
          ${subscription.principalTreatment},
          ${initialization.capLimit}, ${initialization.capConsumed},
          ${Boolean(policy.packageRewardCountsTowardCap)},
          ${Boolean(policy.referralCommissionCountsTowardCap)},
          ${Boolean(policy.teamCommissionCountsTowardCap)},
          ${Boolean(policy.awardRewardCountsTowardCap)},
          ${Boolean(policy.otherIncomeCountsTowardCap)},
          ${initialization.nextRewardLocalDate}, ${initialization.nextRewardAt},
          ${initialization.nextRewardDayNumber}, ${initialization.nextCycleNumber},
          ${initialization.nextCycleDay},
          0, ${initialization.status}, ${initialization.completionReason},
          ${initialization.blockedReason}, 1, ${initialization.completedAt},
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      if (initialization.status === 'COMPLETED') {
        await this.completeSubscription(
          transaction,
          subscription.id,
          initialization.completedAt ?? asOf,
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor?.id ?? null,
          action: 'CREATE',
          entityType: 'PackageRewardState',
          entityId: subscription.id,
          description: 'Package reward/cap lifecycle state initialized.',
          metadata: {
            operation: REWARD_AUDIT_OPERATIONS.INITIALIZE_STATE,
            invokedBy: operation,
            subscriptionId: subscription.id,
            userId: subscription.userId,
            rewardCapPolicyVersionId: policy.id,
            rewardCapPolicyVersionNumber: policy.versionNumber,
            rolloutMode: policy.existingSubscriptionRolloutMode,
            status: initialization.status,
            blockedReason: initialization.blockedReason,
            completionReason: initialization.completionReason,
            capLimit: initialization.capLimit,
            capConsumed: initialization.capConsumed,
            nextRewardLocalDate: initialization.nextRewardLocalDate,
            nextRewardAt: initialization.nextRewardAt.toISOString(),
            nextRewardDayNumber: initialization.nextRewardDayNumber,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        state: await this.requireState(transaction, subscription.id, false),
        initialized: true,
        noEffectivePolicy: false,
      };
    });
  }

  private buildInitialState(
    subscription: RewardSubscriptionRow,
    policy: RewardPolicyRow,
    asOf: Date,
  ) {
    if (!policy.effectiveFrom) {
      throw new ServiceUnavailableException(
        'Published reward/cap policy is missing effectiveFrom.',
      );
    }

    const packageValue = new Prisma.Decimal(subscription.price);
    const capLimit = moneyRoundDown(
      packageValue.mul(new Prisma.Decimal(subscription.capMultiplier)),
    );
    const capConsumed = moneyRoundDown(packageValue);

    const anchor =
      subscription.activatedAt > policy.effectiveFrom
        ? subscription.activatedAt
        : policy.effectiveFrom;
    const activationLocalDate = localDateForInstant(
      subscription.activatedAt,
      subscription.settlementTimezone,
    );
    const anchorLocalDate = localDateForInstant(
      anchor,
      subscription.settlementTimezone,
    );
    const nextRewardLocalDate = addLocalDays(anchorLocalDate, 1);
    const position = deriveRewardPosition(
      activationLocalDate,
      nextRewardLocalDate,
      subscription.cycleDays,
    );
    const nextRewardAt = localDateStartUtc(
      nextRewardLocalDate,
      subscription.settlementTimezone,
    );

    const blockedReason = this.subscriptionBlockedReason(subscription, policy);
    if (blockedReason) {
      return {
        capLimit: moneyString(capLimit),
        capConsumed: moneyString(Prisma.Decimal.min(capConsumed, capLimit)),
        nextRewardLocalDate,
        nextRewardAt,
        nextRewardDayNumber: position.rewardDayNumber,
        nextCycleNumber: position.cycleNumber,
        nextCycleDay: position.cycleDay,
        status: 'BLOCKED' as const,
        completionReason: null,
        blockedReason,
        completedAt: null,
      };
    }

    if (capConsumed.gte(capLimit)) {
      return {
        capLimit: moneyString(capLimit),
        capConsumed: moneyString(capLimit),
        nextRewardLocalDate,
        nextRewardAt,
        nextRewardDayNumber: position.rewardDayNumber,
        nextCycleNumber: position.cycleNumber,
        nextCycleDay: position.cycleDay,
        status: 'COMPLETED' as const,
        completionReason: 'CAP_REACHED' as const,
        blockedReason: null,
        completedAt: asOf,
      };
    }

    if (position.rewardDayNumber > subscription.goalDays) {
      return {
        capLimit: moneyString(capLimit),
        capConsumed: moneyString(capConsumed),
        nextRewardLocalDate,
        nextRewardAt,
        nextRewardDayNumber: position.rewardDayNumber,
        nextCycleNumber: position.cycleNumber,
        nextCycleDay: position.cycleDay,
        status: 'COMPLETED' as const,
        completionReason: 'LIFETIME_REACHED' as const,
        blockedReason: null,
        completedAt: asOf,
      };
    }

    return {
      capLimit: moneyString(capLimit),
      capConsumed: moneyString(capConsumed),
      nextRewardLocalDate,
      nextRewardAt,
      nextRewardDayNumber: position.rewardDayNumber,
      nextCycleNumber: position.cycleNumber,
      nextCycleDay: position.cycleDay,
      status: 'ACTIVE' as const,
      completionReason: null,
      blockedReason: null,
      completedAt: null,
    };
  }

  private async processOneDueReward(
    subscriptionId: string,
    asOf: Date,
    actor: RewardActor,
    context: RequestContext,
    operation: RewardAuditOperation,
  ): Promise<ProcessOneResult> {
    return this.runSerializable(async (transaction) => {
      const subscription = await this.requireSubscription(
        transaction,
        subscriptionId,
        true,
      );
      const state = await this.requireState(transaction, subscriptionId, true);
      if (state.status !== 'ACTIVE') {
        return {
          createdEvent: false,
          event: null,
          state,
          due: false,
          terminal: true,
        };
      }
      if (state.nextRewardAt > asOf) {
        return {
          createdEvent: false,
          event: null,
          state,
          due: false,
          terminal: false,
        };
      }
      if (subscription.status !== 'ACTIVE') {
        throw new ConflictException(
          'Reward state is ACTIVE while package subscription is not ACTIVE.',
        );
      }

      const policy = await this.requirePolicy(
        transaction,
        state.rewardCapPolicyVersionId,
        false,
      );
      this.assertExecutablePolicy(policy);
      const blockedReason = this.subscriptionBlockedReason(subscription, policy);
      if (blockedReason) {
        await this.blockState(transaction, state, blockedReason);
        return {
          createdEvent: false,
          event: null,
          state: await this.requireState(transaction, subscriptionId, false),
          due: false,
          terminal: true,
        };
      }

      if (state.nextRewardDayNumber > subscription.goalDays) {
        await this.completeStateAndSubscription(
          transaction,
          state,
          subscription,
          'LIFETIME_REACHED',
          asOf,
        );
        return {
          createdEvent: false,
          event: null,
          state: await this.requireState(transaction, subscriptionId, false),
          due: false,
          terminal: true,
        };
      }

      const localRewardDate = this.dateOnlyString(state.nextRewardLocalDate);
      const sourceKey = packageRewardSourceKey(
        subscription.id,
        localRewardDate,
      );
      const existingEvents = await transaction.$queryRaw<RewardEventRow[]>(
        Prisma.sql`
          SELECT *
          FROM package_reward_events
          WHERE sourceKey = ${sourceKey}
          LIMIT 1
          FOR UPDATE
        `,
      );
      if (existingEvents.length > 0) {
        throw new ServiceUnavailableException(
          'Reward event exists while lifecycle state still targets the same reward day; reconciliation requires investigation.',
        );
      }

      const selectedRate = this.selectRate(subscription, sourceKey);
      const calculatedReward = moneyRoundDown(
        new Prisma.Decimal(subscription.price).mul(selectedRate).div(100),
      );
      if (calculatedReward.lte(0)) {
        throw new ServiceUnavailableException(
          'Calculated package reward is below supported money precision.',
        );
      }

      const capLimit = new Prisma.Decimal(state.capLimit);
      const capBefore = new Prisma.Decimal(state.capConsumed);
      const headroom = capLimit.minus(capBefore);
      if (headroom.lte(0)) {
        await this.completeStateAndSubscription(
          transaction,
          state,
          subscription,
          'CAP_REACHED',
          asOf,
        );
        return {
          createdEvent: false,
          event: null,
          state: await this.requireState(transaction, subscriptionId, false),
          due: false,
          terminal: true,
        };
      }

      const postedReward = Prisma.Decimal.min(calculatedReward, headroom);
      const capAfter = Boolean(state.packageRewardCountsTowardCap)
        ? capBefore.plus(postedReward)
        : capBefore;
      const clippedToCap = postedReward.lt(calculatedReward);
      const capReached = capAfter.gte(capLimit);
      const lifetimeReached = state.nextRewardDayNumber >= subscription.goalDays;
      const completionReason: PackageRewardCompletionReason | null = capReached
        ? 'CAP_REACHED'
        : lifetimeReached
          ? 'LIFETIME_REACHED'
          : null;

      const ledgerTransactionId = await this.postRewardLedger(
        transaction,
        sourceKey,
        subscription,
        policy,
        state,
        selectedRate,
        calculatedReward,
        postedReward,
        capBefore,
        capAfter,
        actor,
      );

      const eventId = randomUUID();
      const postedAt = new Date();
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO package_reward_events (
          id, sourceKey, subscriptionId, userId, rewardCapPolicyVersionId,
          packagePlanVersionId, packagePlanItemId, packageCode, packageDisplayName,
          packageValue, currency,
          rewardLocalDate, rewardDayNumber, cycleNumber, cycleDay,
          settlementTimezone, rewardStartMode, rewardFrequency,
          cycleDayMode, rewardDayMode,
          rewardRateMode, rewardRateMeaning, selectedRate,
          calculatedReward, postedReward,
          capBasis, capMultiplier, principalTreatment,
          capLimit, capConsumedBefore, capConsumedAfter, clippedToCap,
          existingSubscriptionRolloutMode,
          packageRewardCountsTowardCap,
          referralCommissionCountsTowardCap,
          teamCommissionCountsTowardCap,
          awardRewardCountsTowardCap,
          otherIncomeCountsTowardCap,
          cycleDays, goalDays, cycleEndAction, capReachedAction,
          ledgerTransactionId, completionReason, postedAt, createdAt
        ) VALUES (
          ${eventId}, ${sourceKey}, ${subscription.id}, ${subscription.userId}, ${policy.id},
          ${subscription.packagePlanVersionId}, ${subscription.packagePlanItemId},
          ${subscription.packageCode}, ${subscription.packageDisplayName},
          ${moneyString(subscription.price)}, ${subscription.currency},
          ${localRewardDate}, ${state.nextRewardDayNumber},
          ${state.nextCycleNumber}, ${state.nextCycleDay},
          ${subscription.settlementTimezone}, ${subscription.rewardStartMode},
          ${subscription.rewardFrequency}, ${subscription.cycleDayMode},
          ${subscription.rewardDayMode}, ${subscription.rewardRateMode},
          ${subscription.rewardRateMeaning}, ${rateString(selectedRate)},
          ${moneyString(calculatedReward)}, ${moneyString(postedReward)},
          ${subscription.capBasis}, ${new Prisma.Decimal(subscription.capMultiplier).toFixed(4)},
          ${subscription.principalTreatment}, ${moneyString(capLimit)},
          ${moneyString(capBefore)}, ${moneyString(capAfter)}, ${clippedToCap},
          ${policy.existingSubscriptionRolloutMode},
          ${Boolean(policy.packageRewardCountsTowardCap)},
          ${Boolean(policy.referralCommissionCountsTowardCap)},
          ${Boolean(policy.teamCommissionCountsTowardCap)},
          ${Boolean(policy.awardRewardCountsTowardCap)},
          ${Boolean(policy.otherIncomeCountsTowardCap)},
          ${subscription.cycleDays}, ${subscription.goalDays},
          ${subscription.cycleEndAction}, ${subscription.capReachedAction},
          ${ledgerTransactionId}, ${completionReason}, ${postedAt}, CURRENT_TIMESTAMP(3)
        )
      `);

      if (completionReason) {
        await this.completeStateAndSubscription(
          transaction,
          state,
          subscription,
          completionReason,
          postedAt,
          moneyString(capAfter),
          true,
        );
      } else {
        const nextLocalDate = addLocalDays(localRewardDate, 1);
        const activationLocalDate = localDateForInstant(
          subscription.activatedAt,
          subscription.settlementTimezone,
        );
        const nextPosition = deriveRewardPosition(
          activationLocalDate,
          nextLocalDate,
          subscription.cycleDays,
        );
        const nextRewardAt = localDateStartUtc(
          nextLocalDate,
          subscription.settlementTimezone,
        );
        const updated = await transaction.$executeRaw(Prisma.sql`
          UPDATE package_reward_states
          SET
            capConsumed = ${moneyString(capAfter)},
            nextRewardLocalDate = ${nextLocalDate},
            nextRewardAt = ${nextRewardAt},
            nextRewardDayNumber = ${nextPosition.rewardDayNumber},
            nextCycleNumber = ${nextPosition.cycleNumber},
            nextCycleDay = ${nextPosition.cycleDay},
            settledRewardCount = settledRewardCount + 1,
            revision = revision + 1,
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE subscriptionId = ${state.subscriptionId}
            AND revision = ${state.revision}
            AND status = 'ACTIVE'
        `);
        if (updated !== 1) {
          throw new ConflictException(
            'Package reward lifecycle state changed concurrently.',
          );
        }
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor?.id ?? null,
          action: 'CREATE',
          entityType: 'PackageRewardEvent',
          entityId: eventId,
          description: 'Package reward posted through immutable ledger.',
          metadata: {
            operation: REWARD_AUDIT_OPERATIONS.POST_REWARD,
            invokedBy: operation,
            sourceKey,
            subscriptionId: subscription.id,
            userId: subscription.userId,
            packageCode: subscription.packageCode,
            rewardLocalDate: localRewardDate,
            rewardDayNumber: state.nextRewardDayNumber,
            cycleNumber: state.nextCycleNumber,
            cycleDay: state.nextCycleDay,
            selectedRate: rateString(selectedRate),
            calculatedReward: moneyString(calculatedReward),
            postedReward: moneyString(postedReward),
            clippedToCap,
            capConsumedBefore: moneyString(capBefore),
            capConsumedAfter: moneyString(capAfter),
            capLimit: moneyString(capLimit),
            completionReason,
            ledgerTransactionId,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      const eventRows = await transaction.$queryRaw<RewardEventRow[]>(Prisma.sql`
        SELECT *
        FROM package_reward_events
        WHERE id = ${eventId}
        LIMIT 1
      `);
      const event = eventRows[0];
      if (!event) {
        throw new ServiceUnavailableException(
          'Package reward event could not be read after creation.',
        );
      }

      return {
        createdEvent: true,
        event,
        state: await this.requireState(transaction, subscription.id, false),
        due: true,
        terminal: completionReason !== null,
      };
    });
  }

  private async postRewardLedger(
    transaction: Prisma.TransactionClient,
    sourceKey: string,
    subscription: RewardSubscriptionRow,
    policy: RewardPolicyRow,
    state: RewardStateRow,
    selectedRate: Prisma.Decimal,
    calculatedReward: Prisma.Decimal,
    postedReward: Prisma.Decimal,
    capBefore: Prisma.Decimal,
    capAfter: Prisma.Decimal,
    actor: RewardActor,
  ) {
    const currency = subscription.currency.toUpperCase();
    const expense = await this.ensureLedgerAccount(
      transaction,
      packageRewardExpenseAccountKey(currency),
      'SYSTEM',
      null,
      'PACKAGE_REWARD_EXPENSE',
      currency,
      'DEBIT',
    );
    const earnings = await this.ensureLedgerAccount(
      transaction,
      userWalletAccountKey(subscription.userId, 'PACKAGE_EARNINGS', currency),
      'USER',
      subscription.userId,
      'PACKAGE_EARNINGS',
      currency,
      'CREDIT',
    );
    const transactionId = randomUUID();

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_transactions (
        id, kind, sourceKey, sourceType, sourceId, currency,
        postedByUserId, description, metadata, postedAt, createdAt
      ) VALUES (
        ${transactionId}, 'PACKAGE_REWARD_CREDIT', ${sourceKey},
        'PACKAGE_SUBSCRIPTION', ${subscription.id}, ${currency}, ${actor?.id ?? null},
        ${`Package reward for ${subscription.packageDisplayName} on ${this.dateOnlyString(state.nextRewardLocalDate)}.`},
        ${JSON.stringify({
          sourceSubscriptionId: subscription.id,
          userId: subscription.userId,
          rewardCapPolicyVersionId: policy.id,
          rewardCapPolicyVersionNumber: policy.versionNumber,
          rewardLocalDate: this.dateOnlyString(state.nextRewardLocalDate),
          rewardDayNumber: state.nextRewardDayNumber,
          cycleNumber: state.nextCycleNumber,
          cycleDay: state.nextCycleDay,
          selectedRate: rateString(selectedRate),
          calculatedReward: moneyString(calculatedReward),
          postedReward: moneyString(postedReward),
          capConsumedBefore: moneyString(capBefore),
          capConsumedAfter: moneyString(capAfter),
          capLimit: moneyString(state.capLimit),
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
      moneyString(postedReward),
      `Package reward expense for ${subscription.packageDisplayName}.`,
    );
    await this.insertLedgerEntry(
      transaction,
      transactionId,
      earnings.id,
      'CREDIT',
      moneyString(postedReward),
      `Package earnings reward for ${subscription.packageDisplayName}.`,
    );
    await this.assertBalanced(transaction, transactionId);
    await this.applyBalance(
      transaction,
      expense,
      'DEBIT',
      moneyString(postedReward),
    );
    await this.applyBalance(
      transaction,
      earnings,
      'CREDIT',
      moneyString(postedReward),
    );
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
      throw new ServiceUnavailableException('Reward ledger account is missing.');
    }
    if (
      account.ownerType !== ownerType ||
      account.ownerUserId !== ownerUserId ||
      account.bucket !== bucket ||
      account.currency !== currency ||
      account.normalSide !== normalSide
    ) {
      throw new ServiceUnavailableException(
        'Reward ledger account semantics are inconsistent.',
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
    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    for (const row of rows) {
      const amount = new Prisma.Decimal(row.amount);
      if (row.side === 'DEBIT') debits = debits.plus(amount);
      else credits = credits.plus(amount);
    }
    if (rows.length < 2 || debits.lte(0) || !debits.equals(credits)) {
      throw new ServiceUnavailableException(
        'Package reward ledger transaction is not balanced.',
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
        'Package reward ledger balance could not be updated.',
      );
    }
  }

  private async completeStateAndSubscription(
    transaction: Prisma.TransactionClient,
    state: RewardStateRow,
    subscription: RewardSubscriptionRow,
    reason: PackageRewardCompletionReason,
    completedAt: Date,
    capConsumed?: string,
    incrementSettledReward = false,
  ) {
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE package_reward_states
      SET
        capConsumed = ${capConsumed ?? moneyString(state.capConsumed)},
        settledRewardCount = settledRewardCount + ${incrementSettledReward ? 1 : 0},
        status = 'COMPLETED',
        completionReason = ${reason},
        blockedReason = NULL,
        revision = revision + 1,
        completedAt = ${completedAt},
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE subscriptionId = ${state.subscriptionId}
        AND revision = ${state.revision}
        AND status = 'ACTIVE'
    `);
    if (updated !== 1) {
      throw new ConflictException(
        'Package reward lifecycle state changed concurrently.',
      );
    }
    await this.completeSubscription(transaction, subscription.id, completedAt);
  }

  private async completeSubscription(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    completedAt: Date,
  ) {
    await transaction.$executeRaw(Prisma.sql`
      UPDATE user_package_subscriptions
      SET status = 'COMPLETED', completedAt = ${completedAt}, updatedAt = CURRENT_TIMESTAMP(3)
      WHERE id = ${subscriptionId}
        AND status = 'ACTIVE'
    `);
  }

  private async blockState(
    transaction: Prisma.TransactionClient,
    state: RewardStateRow,
    reason: string,
  ) {
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE package_reward_states
      SET
        status = 'BLOCKED',
        blockedReason = ${reason},
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE subscriptionId = ${state.subscriptionId}
        AND revision = ${state.revision}
        AND status = 'ACTIVE'
    `);
    if (updated !== 1) {
      throw new ConflictException(
        'Package reward lifecycle state changed concurrently.',
      );
    }
  }

  private selectRate(
    subscription: RewardSubscriptionRow,
    sourceKey: string,
  ): Prisma.Decimal {
    if (subscription.rewardRateMode === 'FIXED') {
      if (subscription.fixedRewardRate === null) {
        throw new ServiceUnavailableException(
          'FIXED package reward is missing fixedRewardRate.',
        );
      }
      return new Prisma.Decimal(subscription.fixedRewardRate);
    }
    if (subscription.rewardRateMode === 'RANDOM_RANGE') {
      if (
        subscription.minimumRewardRate === null ||
        subscription.maximumRewardRate === null
      ) {
        throw new ServiceUnavailableException(
          'RANDOM_RANGE package reward is missing min/max rate.',
        );
      }
      return deterministicRateInRange(
        sourceKey,
        subscription.minimumRewardRate,
        subscription.maximumRewardRate,
      );
    }
    throw new ServiceUnavailableException(
      `Reward rate mode ${subscription.rewardRateMode} requires its dedicated engine.`,
    );
  }

  private subscriptionBlockedReason(
    subscription: RewardSubscriptionRow,
    policy: RewardPolicyRow,
  ): string | null {
    try {
      this.assertExecutablePolicy(policy);
    } catch (error) {
      return error instanceof Error ? error.message.slice(0, 120) : 'POLICY_BLOCKED';
    }

    if (
      !RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.rewardRateModes.includes(
        subscription.rewardRateMode as 'FIXED' | 'RANDOM_RANGE',
      )
    ) {
      return `UNSUPPORTED_RATE_MODE:${subscription.rewardRateMode}`;
    }
    if (
      subscription.rewardRateMeaning !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.rewardRateMeaning
    ) {
      return `UNSUPPORTED_RATE_MEANING:${subscription.rewardRateMeaning}`;
    }
    if (subscription.capBasis !== RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.capBasis) {
      return `UNSUPPORTED_CAP_BASIS:${subscription.capBasis}`;
    }
    if (
      subscription.principalTreatment !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.principalTreatment
    ) {
      return `UNSUPPORTED_PRINCIPAL:${subscription.principalTreatment}`;
    }
    if (
      subscription.rewardStartMode !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.rewardStartMode
    ) {
      return `UNSUPPORTED_START_MODE:${subscription.rewardStartMode}`;
    }
    if (
      subscription.rewardFrequency !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.rewardFrequency
    ) {
      return `UNSUPPORTED_FREQUENCY:${subscription.rewardFrequency}`;
    }
    if (
      subscription.cycleDayMode !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.cycleDayMode
    ) {
      return `UNSUPPORTED_CYCLE_DAY_MODE:${subscription.cycleDayMode}`;
    }
    if (
      subscription.rewardDayMode !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.rewardDayMode
    ) {
      return `UNSUPPORTED_REWARD_DAY_MODE:${subscription.rewardDayMode}`;
    }
    if (
      subscription.cycleEndAction !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.cycleEndAction
    ) {
      return `UNSUPPORTED_CYCLE_END:${subscription.cycleEndAction}`;
    }
    if (
      subscription.capReachedAction !==
      RWD01_EXECUTABLE_SUBSCRIPTION_TERMS.capReachedAction
    ) {
      return `UNSUPPORTED_CAP_ACTION:${subscription.capReachedAction}`;
    }
    return null;
  }

  private assertExecutablePolicy(policy: RewardPolicyRow) {
    if (
      policy.existingSubscriptionRolloutMode !==
        RWD01_EXECUTABLE_POLICY.rolloutMode ||
      Boolean(policy.packageRewardCountsTowardCap) !==
        RWD01_EXECUTABLE_POLICY.packageRewardCountsTowardCap ||
      Boolean(policy.referralCommissionCountsTowardCap) !==
        RWD01_EXECUTABLE_POLICY.referralCommissionCountsTowardCap ||
      Boolean(policy.teamCommissionCountsTowardCap) !==
        RWD01_EXECUTABLE_POLICY.teamCommissionCountsTowardCap ||
      Boolean(policy.awardRewardCountsTowardCap) !==
        RWD01_EXECUTABLE_POLICY.awardRewardCountsTowardCap ||
      Boolean(policy.otherIncomeCountsTowardCap) !==
        RWD01_EXECUTABLE_POLICY.otherIncomeCountsTowardCap
    ) {
      throw new BadRequestException(
        'This reward/cap policy requires a deferred cap/rollout engine and cannot execute in RWD-01.',
      );
    }
  }

  private async resolvePolicyForSubscription(
    transaction: Prisma.TransactionClient,
    activatedAt: Date,
    asOf: Date,
  ) {
    const activationRows = await transaction.$queryRaw<RewardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM reward_cap_policy_versions
      WHERE status = 'PUBLISHED'
        AND effectiveFrom <= ${activatedAt}
        AND (effectiveTo IS NULL OR effectiveTo > ${activatedAt})
      ORDER BY effectiveFrom DESC, versionNumber DESC
      LIMIT 1
    `);
    if (activationRows[0]) return activationRows[0];

    const firstLaterRows = await transaction.$queryRaw<RewardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM reward_cap_policy_versions
      WHERE status = 'PUBLISHED'
        AND effectiveFrom > ${activatedAt}
        AND effectiveFrom <= ${asOf}
      ORDER BY effectiveFrom ASC, versionNumber ASC
      LIMIT 1
    `);
    return firstLaterRows[0] ?? null;
  }

  private async requireSubscription(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<RewardSubscriptionRow[]>(Prisma.sql`
      SELECT
        id, userId, packagePlanVersionId, packagePlanItemId,
        packageCode, packageDisplayName, price, currency,
        settlementTimezone, rewardRateMode, fixedRewardRate,
        minimumRewardRate, maximumRewardRate, rewardRateMeaning,
        capBasis, capMultiplier, principalTreatment,
        goalDays, cycleDays, rewardStartMode, rewardFrequency,
        cycleDayMode, rewardDayMode, cycleEndAction, capReachedAction,
        status, activatedAt, scheduledEndAt, completedAt
      FROM user_package_subscriptions
      WHERE id = ${subscriptionId}
      LIMIT 1
      ${lock}
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Package subscription was not found.');
    return row;
  }

  private async findState(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<RewardStateRow[]>(Prisma.sql`
      SELECT *
      FROM package_reward_states
      WHERE subscriptionId = ${subscriptionId}
      LIMIT 1
      ${lock}
    `);
    return rows[0] ?? null;
  }

  private async requireState(
    transaction: Prisma.TransactionClient,
    subscriptionId: string,
    forUpdate: boolean,
  ) {
    const row = await this.findState(transaction, subscriptionId, forUpdate);
    if (!row) {
      throw new NotFoundException('Package reward lifecycle state was not found.');
    }
    return row;
  }

  private async requirePolicy(
    transaction: Prisma.TransactionClient | PrismaService,
    policyVersionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<RewardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM reward_cap_policy_versions
      WHERE id = ${policyVersionId}
      LIMIT 1
      ${lock}
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Reward/cap policy was not found.');
    return row;
  }

  private policySnapshot(row: RewardPolicyRow) {
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      revision: row.revision,
      existingSubscriptionRolloutMode: row.existingSubscriptionRolloutMode,
      packageRewardCountsTowardCap: Boolean(row.packageRewardCountsTowardCap),
      referralCommissionCountsTowardCap: Boolean(
        row.referralCommissionCountsTowardCap,
      ),
      teamCommissionCountsTowardCap: Boolean(row.teamCommissionCountsTowardCap),
      awardRewardCountsTowardCap: Boolean(row.awardRewardCountsTowardCap),
      otherIncomeCountsTowardCap: Boolean(row.otherIncomeCountsTowardCap),
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      publishedAt: row.publishedAt,
      clonedFromPolicyVersionId: row.clonedFromPolicyVersionId,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      publishedByUserId: row.publishedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private stateSnapshot(row: RewardStateRow, admin = false) {
    const base = {
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      packageDisplayName: row.packageDisplayName,
      rewardCapPolicyVersionId: row.rewardCapPolicyVersionId,
      currency: row.currency,
      packageValue: moneyString(row.packageValue),
      capBasis: row.capBasis,
      capMultiplier: new Prisma.Decimal(row.capMultiplier).toFixed(4),
      principalTreatment: row.principalTreatment,
      capLimit: moneyString(row.capLimit),
      capConsumed: moneyString(row.capConsumed),
      capRemaining: moneyString(
        Prisma.Decimal.max(
          new Prisma.Decimal(0),
          new Prisma.Decimal(row.capLimit).minus(row.capConsumed),
        ),
      ),
      packageRewardCountsTowardCap: Boolean(row.packageRewardCountsTowardCap),
      referralCommissionCountsTowardCap: Boolean(
        row.referralCommissionCountsTowardCap,
      ),
      teamCommissionCountsTowardCap: Boolean(row.teamCommissionCountsTowardCap),
      awardRewardCountsTowardCap: Boolean(row.awardRewardCountsTowardCap),
      otherIncomeCountsTowardCap: Boolean(row.otherIncomeCountsTowardCap),
      nextRewardLocalDate: this.dateOnlyString(row.nextRewardLocalDate),
      nextRewardAt: row.nextRewardAt,
      nextRewardDayNumber: row.nextRewardDayNumber,
      nextCycleNumber: row.nextCycleNumber,
      nextCycleDay: row.nextCycleDay,
      settledRewardCount: row.settledRewardCount,
      status: row.status,
      completionReason: row.completionReason,
      blockedReason: row.blockedReason,
      revision: row.revision,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return admin
      ? { ...base, username: row.username, email: row.email }
      : base;
  }

  private eventSnapshot(row: RewardEventRow, admin: boolean) {
    const base = {
      id: row.id,
      sourceKey: row.sourceKey,
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      rewardCapPolicyVersionId: row.rewardCapPolicyVersionId,
      packagePlanVersionId: row.packagePlanVersionId,
      packagePlanItemId: row.packagePlanItemId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      packageValue: moneyString(row.packageValue),
      currency: row.currency,
      rewardLocalDate: this.dateOnlyString(row.rewardLocalDate),
      rewardDayNumber: row.rewardDayNumber,
      cycleNumber: row.cycleNumber,
      cycleDay: row.cycleDay,
      settlementTimezone: row.settlementTimezone,
      rewardStartMode: row.rewardStartMode,
      rewardFrequency: row.rewardFrequency,
      cycleDayMode: row.cycleDayMode,
      rewardDayMode: row.rewardDayMode,
      rewardRateMode: row.rewardRateMode,
      rewardRateMeaning: row.rewardRateMeaning,
      selectedRate: rateString(row.selectedRate),
      calculatedReward: moneyString(row.calculatedReward),
      postedReward: moneyString(row.postedReward),
      capBasis: row.capBasis,
      capMultiplier: new Prisma.Decimal(row.capMultiplier).toFixed(4),
      principalTreatment: row.principalTreatment,
      capLimit: moneyString(row.capLimit),
      capConsumedBefore: moneyString(row.capConsumedBefore),
      capConsumedAfter: moneyString(row.capConsumedAfter),
      clippedToCap: Boolean(row.clippedToCap),
      existingSubscriptionRolloutMode: row.existingSubscriptionRolloutMode,
      packageRewardCountsTowardCap: Boolean(row.packageRewardCountsTowardCap),
      referralCommissionCountsTowardCap: Boolean(
        row.referralCommissionCountsTowardCap,
      ),
      teamCommissionCountsTowardCap: Boolean(row.teamCommissionCountsTowardCap),
      awardRewardCountsTowardCap: Boolean(row.awardRewardCountsTowardCap),
      otherIncomeCountsTowardCap: Boolean(row.otherIncomeCountsTowardCap),
      cycleDays: row.cycleDays,
      goalDays: row.goalDays,
      cycleEndAction: row.cycleEndAction,
      capReachedAction: row.capReachedAction,
      ledgerTransactionId: row.ledgerTransactionId,
      completionReason: row.completionReason,
      postedAt: row.postedAt,
      createdAt: row.createdAt,
    };
    return admin ? { ...base, username: row.username, email: row.email } : base;
  }

  private dateOnlyString(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private parseDate(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO-8601 date.`);
    }
    return parsed;
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
