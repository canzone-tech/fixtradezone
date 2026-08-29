import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  AdminSimulatedActivityEventQueryDto,
  CreateSimulatedActivityPolicyDraftDto,
  PublishSimulatedActivityPolicyDto,
  SimulatedActivityPageQueryDto,
  UpdateSimulatedActivityPolicyDto,
} from './dto/simulated-activity.dto';
import {
  deterministicSimulatedSlot,
  localDateForInstant,
  localDateStartAtOrAfterUtc,
  nextLocalDateStartUtc,
  validateIanaTimezone,
  validateTimingWindows,
} from './simulated-activity.calculation';
import {
  SIMULATED_ACTIVITY_BATCH_LIMIT,
  SIMULATED_ACTIVITY_DISCLOSURE,
  SIMULATED_ACTIVITY_MAX_PER_DAY,
  simulatedActivitySourceKey,
  type SimulatedActivityGenerationSource,
  type SimulatedActivityOutcome,
  type SimulatedActivityPolicyStatus,
  type SimulatedTimingWindow,
} from './simulated-activity.constants';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type DecimalValue = Prisma.Decimal | number | string;
type SimulationActor = Pick<AuthenticatedUser, 'id'> | null;

interface CountRow {
  total: bigint | number | string;
}

interface PolicyRow {
  id: string;
  versionNumber: number;
  status: SimulatedActivityPolicyStatus;
  revision: number;
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
  publishedAt: Date | null;
  clonedFromPolicyVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SubscriptionRow {
  id: string;
  userId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
  activatedAt: Date;
  scheduledEndAt: Date;
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
  localActivityDate: Date | string;
  slotNumber: number;
  scheduledAt: Date;
  timezoneSnapshot: string;
  assetSymbol: string;
  outcome: SimulatedActivityOutcome;
  resultPercent: DecimalValue;
  generationSource: SimulatedActivityGenerationSource;
  generatedByUserId: string | null;
  generatedAt: Date;
  createdAt: Date;
  username?: string;
  email?: string | null;
}

interface OperationsRow {
  platformTimezone: string;
}

interface WorkerHealth {
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  lastSummary: SimulatedActivityBatchSummary | null;
}

export interface SimulatedActivityBatchSummary {
  asOf: string;
  localActivityDate: string | null;
  policyVersionId: string | null;
  policyVersionNumber: number | null;
  policyEnabled: boolean;
  eligibleSubscriptions: number;
  processedSubscriptions: number;
  remainingSubscriptions: number;
  createdEvents: number;
  alreadyPresent: number;
  skippedNotDue: number;
  noEffectivePolicy: boolean;
}

interface ProcessSubscriptionResult {
  createdEvents: number;
  alreadyPresent: number;
  skippedNotDue: number;
  eligible: boolean;
  events: EventRow[];
}

interface NormalizedPolicyConfig {
  enabled: boolean;
  activitiesPerDay: number;
  assetSymbols: string[];
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: SimulatedTimingWindow[];
}

@Injectable()
export class SimulatedActivityService {
  private readonly workerHealth: WorkerHealth = {
    lastStartedAt: null,
    lastCompletedAt: null,
    lastErrorAt: null,
    lastError: null,
    lastSummary: null,
  };

  constructor(private readonly prisma: PrismaService) {}

  async listPolicies() {
    const rows = await this.prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
      SELECT *
      FROM simulated_activity_policy_versions
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
    dto: CreateSimulatedActivityPolicyDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    return this.runSerializable(async (transaction) => {
      const drafts = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id
        FROM simulated_activity_policy_versions
        WHERE status = 'DRAFT'
        LIMIT 1
        FOR UPDATE
      `);
      if (drafts.length > 0) {
        throw new ConflictException(
          'A simulated activity policy draft already exists. Publish or finish it first.',
        );
      }

      const source = await this.requirePolicy(
        transaction,
        dto.sourcePolicyVersionId,
        true,
      );
      if (source.status !== 'PUBLISHED') {
        throw new ConflictException(
          'Only a published simulated activity policy may be cloned.',
        );
      }
      const sourceConfig = this.normalizedPolicyConfig(source);
      this.validatePolicyConfig(sourceConfig);

      const maxRows = await transaction.$queryRaw<
        { maxVersion: number | null }[]
      >(Prisma.sql`
        SELECT MAX(versionNumber) AS maxVersion
        FROM simulated_activity_policy_versions
      `);
      const versionNumber = (maxRows[0]?.maxVersion ?? 0) + 1;
      const id = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO simulated_activity_policy_versions (
          id, versionNumber, status, revision, enabled, activitiesPerDay,
          assetSymbols, winWeight, lossWeight,
          winMinimumPercent, winMaximumPercent,
          lossMinimumPercent, lossMaximumPercent,
          timingWindows, timezoneSnapshot,
          effectiveFrom, effectiveTo, publishedAt,
          clonedFromPolicyVersionId,
          createdByUserId, updatedByUserId, publishedByUserId,
          createdAt, updatedAt
        ) VALUES (
          ${id}, ${versionNumber}, 'DRAFT', 1,
          ${sourceConfig.enabled}, ${sourceConfig.activitiesPerDay},
          ${JSON.stringify(sourceConfig.assetSymbols)},
          ${sourceConfig.winWeight}, ${sourceConfig.lossWeight},
          ${sourceConfig.winMinimumPercent}, ${sourceConfig.winMaximumPercent},
          ${sourceConfig.lossMinimumPercent}, ${sourceConfig.lossMaximumPercent},
          ${JSON.stringify(sourceConfig.timingWindows)}, NULL,
          NULL, NULL, NULL,
          ${source.id}, ${actor.id}, ${actor.id}, NULL,
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'SimulatedActivityPolicyVersion',
          entityId: id,
          description:
            'Published simulated activity policy cloned into a new draft.',
          metadata: {
            source: 'SIMULATED_ACTIVITY_POLICY',
            operation: 'CLONE_DRAFT',
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
    dto: UpdateSimulatedActivityPolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    return this.runSerializable(async (transaction) => {
      const current = await this.requirePolicy(
        transaction,
        policyVersionId,
        true,
      );
      if (current.status !== 'DRAFT') {
        throw new ConflictException(
          'Published simulated activity policy is immutable.',
        );
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Simulated activity policy draft changed. Reload before saving.',
        );
      }

      const currentConfig = this.normalizedPolicyConfig(current);
      const next: NormalizedPolicyConfig = {
        enabled: dto.enabled ?? currentConfig.enabled,
        activitiesPerDay:
          dto.activitiesPerDay ?? currentConfig.activitiesPerDay,
        assetSymbols: dto.assetSymbols ?? currentConfig.assetSymbols,
        winWeight: dto.winWeight ?? currentConfig.winWeight,
        lossWeight: dto.lossWeight ?? currentConfig.lossWeight,
        winMinimumPercent:
          dto.winMinimumPercent ?? currentConfig.winMinimumPercent,
        winMaximumPercent:
          dto.winMaximumPercent ?? currentConfig.winMaximumPercent,
        lossMinimumPercent:
          dto.lossMinimumPercent ?? currentConfig.lossMinimumPercent,
        lossMaximumPercent:
          dto.lossMaximumPercent ?? currentConfig.lossMaximumPercent,
        timingWindows: dto.timingWindows ?? currentConfig.timingWindows,
      };
      this.validatePolicyConfig(next);

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE simulated_activity_policy_versions
        SET
          enabled = ${next.enabled},
          activitiesPerDay = ${next.activitiesPerDay},
          assetSymbols = ${JSON.stringify(next.assetSymbols)},
          winWeight = ${next.winWeight},
          lossWeight = ${next.lossWeight},
          winMinimumPercent = ${next.winMinimumPercent},
          winMaximumPercent = ${next.winMaximumPercent},
          lossMinimumPercent = ${next.lossMinimumPercent},
          lossMaximumPercent = ${next.lossMaximumPercent},
          timingWindows = ${JSON.stringify(next.timingWindows)},
          updatedByUserId = ${actor.id},
          revision = revision + 1,
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${dto.expectedRevision}
      `);
      if (updated !== 1) {
        throw new ConflictException(
          'Simulated activity policy draft changed. Reload before saving.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SimulatedActivityPolicyVersion',
          entityId: policyVersionId,
          description: 'SUPER_ADMIN updated simulated activity policy draft.',
          metadata: {
            source: 'SIMULATED_ACTIVITY_POLICY',
            operation: 'UPDATE_DRAFT',
            reason: dto.reason,
            before: currentConfig,
            after: next,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, policyVersionId, false),
      );
    });
  }

  async publishPolicy(
    policyVersionId: string,
    dto: PublishSimulatedActivityPolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    return this.runSerializable(async (transaction) => {
      const current = await this.requirePolicy(
        transaction,
        policyVersionId,
        true,
      );
      if (current.status !== 'DRAFT') {
        throw new ConflictException(
          'Published simulated activity policy is immutable.',
        );
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Simulated activity policy draft changed. Reload before publishing.',
        );
      }
      const config = this.normalizedPolicyConfig(current);
      this.validatePolicyConfig(config);

      const operationsRows = await transaction.$queryRaw<OperationsRow[]>(
        Prisma.sql`
          SELECT platformTimezone
          FROM system_operations_config
          WHERE id = 1
          LIMIT 1
          FOR UPDATE
        `,
      );
      const timezoneSnapshot = operationsRows[0]?.platformTimezone;
      if (!timezoneSnapshot) {
        throw new ServiceUnavailableException(
          'Platform Operations timezone is unavailable; simulated activity publication is blocked.',
        );
      }
      validateIanaTimezone(timezoneSnapshot);

      const publishedAt = new Date();
      const openPolicies = await transaction.$queryRaw<PolicyRow[]>(Prisma.sql`
        SELECT *
        FROM simulated_activity_policy_versions
        WHERE status = 'PUBLISHED'
          AND effectiveTo IS NULL
        ORDER BY versionNumber DESC
        FOR UPDATE
      `);
      if (openPolicies.length > 1) {
        throw new ServiceUnavailableException(
          'Multiple open-ended simulated activity policies exist. Publication is blocked.',
        );
      }

      const predecessor = openPolicies[0] ?? null;
      let predecessorEnd: Date | null = null;
      let effectiveFrom: Date;

      if (predecessor) {
        if (!predecessor.effectiveFrom || !predecessor.timezoneSnapshot) {
          throw new ServiceUnavailableException(
            'The current published simulated activity policy is incomplete.',
          );
        }
        if (predecessor.effectiveFrom > publishedAt) {
          throw new ConflictException(
            'A published simulated activity policy is still waiting for its first effective local-day boundary. Update again after it becomes effective.',
          );
        }
        validateIanaTimezone(predecessor.timezoneSnapshot);
        predecessorEnd = nextLocalDateStartUtc(
          publishedAt,
          predecessor.timezoneSnapshot,
        );
        effectiveFrom = localDateStartAtOrAfterUtc(
          predecessorEnd,
          timezoneSnapshot,
        );
      } else {
        effectiveFrom = nextLocalDateStartUtc(publishedAt, timezoneSnapshot);
      }

      const conflictingPolicies = await transaction.$queryRaw<PolicyRow[]>(
        Prisma.sql`
          SELECT *
          FROM simulated_activity_policy_versions
          WHERE status = 'PUBLISHED'
            AND id <> ${predecessor?.id ?? ''}
            AND effectiveFrom <= ${effectiveFrom}
            AND (effectiveTo IS NULL OR effectiveTo > ${effectiveFrom})
          LIMIT 2
          FOR UPDATE
        `,
      );
      if (conflictingPolicies.length > 0) {
        throw new ConflictException(
          'The safe effective boundary overlaps another published simulated activity policy.',
        );
      }

      if (predecessor && predecessorEnd) {
        const predecessorUpdated = await transaction.$executeRaw(Prisma.sql`
          UPDATE simulated_activity_policy_versions
          SET
            effectiveTo = ${predecessorEnd},
            updatedByUserId = ${actor.id},
            revision = revision + 1,
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${predecessor.id}
            AND effectiveTo IS NULL
        `);
        if (predecessorUpdated !== 1) {
          throw new ConflictException(
            'The predecessor simulated activity policy changed. Reload before publishing.',
          );
        }
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE simulated_activity_policy_versions
        SET
          status = 'PUBLISHED',
          timezoneSnapshot = ${timezoneSnapshot},
          effectiveFrom = ${effectiveFrom},
          effectiveTo = NULL,
          publishedAt = ${publishedAt},
          publishedByUserId = ${actor.id},
          updatedByUserId = ${actor.id},
          revision = revision + 1,
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${dto.expectedRevision}
      `);
      if (updated !== 1) {
        throw new ConflictException(
          'Simulated activity policy draft changed. Reload before publishing.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'APPROVE',
          entityType: 'SimulatedActivityPolicyVersion',
          entityId: policyVersionId,
          description: 'SUPER_ADMIN published simulated activity policy.',
          metadata: {
            source: 'SIMULATED_ACTIVITY_POLICY',
            operation: 'PUBLISH',
            reason: dto.reason,
            versionNumber: current.versionNumber,
            timezoneSnapshot,
            executionBoundary: 'SAFE_LOCAL_CALENDAR_DAY_START',
            effectiveFrom: effectiveFrom.toISOString(),
            predecessorPolicyVersionId: predecessor?.id ?? null,
            predecessorEffectiveTo: predecessorEnd?.toISOString() ?? null,
            timezoneTransitionGapPossible:
              predecessor?.timezoneSnapshot !== undefined &&
              predecessor?.timezoneSnapshot !== null &&
              predecessor.timezoneSnapshot !== timezoneSnapshot,
            configuration: config,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, policyVersionId, false),
      );
    });
  }

  async getMyActivity(
    userId: string,
    query: SimulatedActivityPageQueryDto,
  ) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<EventRow[]>(Prisma.sql`
      SELECT *
      FROM simulated_trade_activity_events
      WHERE userId = ${userId}
        AND scheduledAt <= UTC_TIMESTAMP(3)
      ORDER BY scheduledAt DESC, id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM simulated_trade_activity_events
      WHERE userId = ${userId}
        AND scheduledAt <= UTC_TIMESTAMP(3)
    `);
    const activeRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions
      WHERE userId = ${userId}
        AND status = 'ACTIVE'
        AND activatedAt <= UTC_TIMESTAMP(3)
        AND scheduledEndAt > UTC_TIMESTAMP(3)
    `);
    const policy = await this.findEffectivePolicy(this.prisma, new Date());

    return {
      disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
      financialEffect: 'NONE' as const,
      activeEligibleSubscriptions: this.countNumber(activeRows[0]?.total),
      effectivePolicy: policy ? this.policySnapshot(policy) : null,
      events: rows.map((row) => this.eventSnapshot(row, false)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listEvents(query: AdminSimulatedActivityEventQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND e.userId = ${query.userId}`
      : Prisma.empty;
    const subscriptionFilter = query.subscriptionId
      ? Prisma.sql`AND e.subscriptionId = ${query.subscriptionId}`
      : Prisma.empty;
    const outcomeFilter = query.outcome
      ? Prisma.sql`AND e.outcome = ${query.outcome}`
      : Prisma.empty;
    const dateFilter = query.localActivityDate
      ? Prisma.sql`AND e.localActivityDate = ${query.localActivityDate}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<EventRow[]>(Prisma.sql`
      SELECT e.*, u.username, u.email
      FROM simulated_trade_activity_events e
      INNER JOIN users u ON u.id = e.userId
      WHERE 1 = 1
        ${userFilter}
        ${subscriptionFilter}
        ${outcomeFilter}
        ${dateFilter}
      ORDER BY e.scheduledAt DESC, e.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM simulated_trade_activity_events e
      WHERE 1 = 1
        ${userFilter}
        ${subscriptionFilter}
        ${outcomeFilter}
        ${dateFilter}
    `);

    return {
      disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
      events: rows.map((row) => this.eventSnapshot(row, true)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async getReconciliationSummary(asOf = new Date()) {
    const policy = await this.findEffectivePolicy(this.prisma, asOf);
    if (!policy || !policy.timezoneSnapshot) {
      return {
        disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
        noEffectivePolicy: true,
        policyEnabled: false,
        localActivityDate: null,
        eligibleSubscriptions: 0,
        eventsToday: 0,
        configuredMaximumSlotsToday: 0,
      };
    }

    const localActivityDate = localDateForInstant(
      asOf,
      policy.timezoneSnapshot,
    );
    const eligibleRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions
      WHERE status = 'ACTIVE'
        AND activatedAt <= ${asOf}
        AND scheduledEndAt > ${asOf}
    `);
    const eventRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM simulated_trade_activity_events
      WHERE localActivityDate = ${localActivityDate}
        AND policyVersionId = ${policy.id}
    `);
    const eligibleSubscriptions = this.countNumber(eligibleRows[0]?.total);

    return {
      disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
      noEffectivePolicy: false,
      policyEnabled: Boolean(policy.enabled),
      policyVersionId: policy.id,
      policyVersionNumber: policy.versionNumber,
      localActivityDate,
      timezoneSnapshot: policy.timezoneSnapshot,
      activitiesPerDay: policy.activitiesPerDay,
      eligibleSubscriptions,
      eventsToday: this.countNumber(eventRows[0]?.total),
      configuredMaximumSlotsToday:
        eligibleSubscriptions * policy.activitiesPerDay,
    };
  }

  async processDueBatch(
    actor: SimulationActor,
    context: RequestContext = {},
    fromWorker = false,
    asOf = new Date(),
  ): Promise<SimulatedActivityBatchSummary> {
    const policy = await this.findEffectivePolicy(this.prisma, asOf);
    if (!policy || !policy.timezoneSnapshot) {
      return this.emptyBatch(asOf, null, false, true);
    }
    if (!Boolean(policy.enabled)) {
      return this.emptyBatch(asOf, policy, false, false);
    }

    const config = this.normalizedPolicyConfig(policy);
    this.validatePolicyConfig(config);
    validateIanaTimezone(policy.timezoneSnapshot);
    const localActivityDate = localDateForInstant(
      asOf,
      policy.timezoneSnapshot,
    );

    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM user_package_subscriptions
      WHERE status = 'ACTIVE'
        AND activatedAt <= ${asOf}
        AND scheduledEndAt > ${asOf}
    `);
    const eligibleSubscriptions = this.countNumber(countRows[0]?.total);

    // Prefer subscriptions with fewer generated slots for the current policy/day
    // so repeated bounded batches cannot starve subscriptions after the first
    // SIMULATED_ACTIVITY_BATCH_LIMIT rows.
    const subscriptions = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT ups.id
        FROM user_package_subscriptions ups
        LEFT JOIN simulated_trade_activity_events e
          ON e.subscriptionId = ups.id
          AND e.policyVersionId = ${policy.id}
          AND e.localActivityDate = ${localActivityDate}
        WHERE ups.status = 'ACTIVE'
          AND ups.activatedAt <= ${asOf}
          AND ups.scheduledEndAt > ${asOf}
        GROUP BY ups.id, ups.activatedAt
        ORDER BY COUNT(e.id) ASC, MAX(e.scheduledAt) ASC, ups.activatedAt ASC, ups.id ASC
        LIMIT ${SIMULATED_ACTIVITY_BATCH_LIMIT}
      `,
    );

    let createdEvents = 0;
    let alreadyPresent = 0;
    let skippedNotDue = 0;
    let processedSubscriptions = 0;

    for (const subscription of subscriptions) {
      const result = await this.processSubscription(
        subscription.id,
        actor,
        fromWorker ? 'WORKER' : 'RECONCILIATION',
        asOf,
        policy,
      );
      if (result.eligible) processedSubscriptions += 1;
      createdEvents += result.createdEvents;
      alreadyPresent += result.alreadyPresent;
      skippedNotDue += result.skippedNotDue;
    }

    const summary: SimulatedActivityBatchSummary = {
      asOf: asOf.toISOString(),
      localActivityDate,
      policyVersionId: policy.id,
      policyVersionNumber: policy.versionNumber,
      policyEnabled: true,
      eligibleSubscriptions,
      processedSubscriptions,
      remainingSubscriptions: Math.max(
        0,
        eligibleSubscriptions - processedSubscriptions,
      ),
      createdEvents,
      alreadyPresent,
      skippedNotDue,
      noEffectivePolicy: false,
    };

    if (actor) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SimulatedTradeActivityEvent',
          entityId: null,
          description:
            'Administrator ran idempotent simulated activity reconciliation.',
          metadata: {
            source: 'SIMULATED_ACTIVITY_RECONCILIATION',
            summary,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    }

    return summary;
  }

  async reconcileSubscription(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
    asOf = new Date(),
  ) {
    const policy = await this.findEffectivePolicy(this.prisma, asOf);
    if (!policy || !policy.timezoneSnapshot) {
      return {
        disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
        noEffectivePolicy: true,
        createdEvents: 0,
        events: [],
      };
    }
    if (!Boolean(policy.enabled)) {
      return {
        disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
        noEffectivePolicy: false,
        policyEnabled: false,
        createdEvents: 0,
        events: [],
      };
    }

    const result = await this.processSubscription(
      subscriptionId,
      actor,
      'RECONCILIATION',
      asOf,
      policy,
    );

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'UPDATE',
        entityType: 'SimulatedTradeActivityEvent',
        entityId: subscriptionId,
        description:
          'Administrator reconciled one subscription simulated activity schedule.',
        metadata: {
          source: 'SIMULATED_ACTIVITY_RECONCILIATION',
          subscriptionId,
          asOf: asOf.toISOString(),
          createdEvents: result.createdEvents,
          alreadyPresent: result.alreadyPresent,
          skippedNotDue: result.skippedNotDue,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
      policyVersionId: policy.id,
      policyVersionNumber: policy.versionNumber,
      localActivityDate: localDateForInstant(asOf, policy.timezoneSnapshot),
      createdEvents: result.createdEvents,
      alreadyPresent: result.alreadyPresent,
      skippedNotDue: result.skippedNotDue,
      eligible: result.eligible,
      events: result.events.map((row) => this.eventSnapshot(row, false)),
    };
  }

  noteWorkerStart() {
    this.workerHealth.lastStartedAt = new Date();
  }

  noteWorkerSuccess(summary: SimulatedActivityBatchSummary) {
    this.workerHealth.lastCompletedAt = new Date();
    this.workerHealth.lastError = null;
    this.workerHealth.lastSummary = summary;
  }

  noteWorkerFailure(error: unknown) {
    const now = new Date();
    this.workerHealth.lastCompletedAt = now;
    this.workerHealth.lastErrorAt = now;
    this.workerHealth.lastError =
      error instanceof Error
        ? error.message
        : 'Unknown simulated activity error.';
  }

  getWorkerHealth(): WorkerHealth {
    return { ...this.workerHealth };
  }

  private async processSubscription(
    subscriptionId: string,
    actor: SimulationActor,
    generationSource: SimulatedActivityGenerationSource,
    asOf: Date,
    selectedPolicy: PolicyRow,
  ): Promise<ProcessSubscriptionResult> {
    return this.runSerializable(async (transaction) => {
      const policy = await this.requirePolicy(
        transaction,
        selectedPolicy.id,
        false,
      );
      if (!this.isPolicyEffectiveAt(policy, asOf) || !Boolean(policy.enabled)) {
        throw new ServiceUnavailableException(
          'Simulated activity policy changed during generation. Retry the idempotent operation.',
        );
      }
      if (!policy.effectiveFrom || !policy.timezoneSnapshot) {
        throw new ServiceUnavailableException(
          'Published simulated activity policy is incomplete.',
        );
      }

      const subscription = await this.requireSubscription(
        transaction,
        subscriptionId,
        true,
      );
      if (
        subscription.status !== 'ACTIVE' ||
        subscription.activatedAt > asOf ||
        subscription.scheduledEndAt <= asOf
      ) {
        return {
          createdEvents: 0,
          alreadyPresent: 0,
          skippedNotDue: 0,
          eligible: false,
          events: [],
        };
      }

      const config = this.normalizedPolicyConfig(policy);
      this.validatePolicyConfig(config);
      const localActivityDate = localDateForInstant(
        asOf,
        policy.timezoneSnapshot,
      );
      const anchor =
        subscription.activatedAt > policy.effectiveFrom
          ? subscription.activatedAt
          : policy.effectiveFrom;

      let createdEvents = 0;
      let alreadyPresent = 0;
      let skippedNotDue = 0;
      const events: EventRow[] = [];

      for (
        let slotNumber = 1;
        slotNumber <= config.activitiesPerDay;
        slotNumber += 1
      ) {
        const sourceKey = simulatedActivitySourceKey(
          subscription.id,
          policy.id,
          localActivityDate,
          slotNumber,
        );
        const slot = deterministicSimulatedSlot({
          sourceKey,
          localActivityDate,
          slotNumber,
          activitiesPerDay: config.activitiesPerDay,
          assetSymbols: config.assetSymbols,
          winWeight: config.winWeight,
          lossWeight: config.lossWeight,
          winMinimumPercent: config.winMinimumPercent,
          winMaximumPercent: config.winMaximumPercent,
          lossMinimumPercent: config.lossMinimumPercent,
          lossMaximumPercent: config.lossMaximumPercent,
          timingWindows: config.timingWindows,
          timezoneSnapshot: policy.timezoneSnapshot,
        });

        if (slot.scheduledAt < anchor || slot.scheduledAt > asOf) {
          skippedNotDue += 1;
          continue;
        }

        const existing = await transaction.$queryRaw<EventRow[]>(Prisma.sql`
          SELECT *
          FROM simulated_trade_activity_events
          WHERE sourceKey = ${sourceKey}
          LIMIT 1
        `);
        if (existing[0]) {
          alreadyPresent += 1;
          events.push(existing[0]);
          continue;
        }

        const id = randomUUID();
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO simulated_trade_activity_events (
            id, sourceKey, subscriptionId, userId, policyVersionId,
            packagePlanVersionId, packagePlanItemId,
            packageCode, packageDisplayName,
            localActivityDate, slotNumber, scheduledAt, timezoneSnapshot,
            assetSymbol, outcome, resultPercent,
            generationSource, generatedByUserId, generatedAt, createdAt
          ) VALUES (
            ${id}, ${sourceKey}, ${subscription.id}, ${subscription.userId}, ${policy.id},
            ${subscription.packagePlanVersionId}, ${subscription.packagePlanItemId},
            ${subscription.packageCode}, ${subscription.packageDisplayName},
            ${localActivityDate}, ${slotNumber}, ${slot.scheduledAt}, ${policy.timezoneSnapshot},
            ${slot.assetSymbol}, ${slot.outcome}, ${slot.resultPercent},
            ${generationSource}, ${actor?.id ?? null}, ${asOf}, CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE id = id
        `);

        const rows = await transaction.$queryRaw<EventRow[]>(Prisma.sql`
          SELECT *
          FROM simulated_trade_activity_events
          WHERE sourceKey = ${sourceKey}
          LIMIT 1
        `);
        const event = rows[0];
        if (!event) {
          throw new ServiceUnavailableException(
            'Simulated activity event could not be read after generation.',
          );
        }
        if (event.id === id) createdEvents += 1;
        else alreadyPresent += 1;
        events.push(event);
      }

      return {
        createdEvents,
        alreadyPresent,
        skippedNotDue,
        eligible: true,
        events,
      };
    });
  }

  private async findEffectivePolicy(
    client: Prisma.TransactionClient | PrismaService,
    asOf: Date,
  ) {
    const rows = await client.$queryRaw<PolicyRow[]>(Prisma.sql`
      SELECT *
      FROM simulated_activity_policy_versions
      WHERE status = 'PUBLISHED'
        AND effectiveFrom <= ${asOf}
        AND (effectiveTo IS NULL OR effectiveTo > ${asOf})
      ORDER BY effectiveFrom DESC, versionNumber DESC
      LIMIT 2
    `);
    if (rows.length > 1) {
      throw new ServiceUnavailableException(
        'Simulated activity policy has overlapping effective versions.',
      );
    }
    return rows[0] ?? null;
  }

  private isPolicyEffectiveAt(policy: PolicyRow, asOf: Date): boolean {
    return (
      policy.status === 'PUBLISHED' &&
      policy.effectiveFrom !== null &&
      policy.effectiveFrom <= asOf &&
      (policy.effectiveTo === null || policy.effectiveTo > asOf)
    );
  }

  private async requirePolicy(
    client: Prisma.TransactionClient | PrismaService,
    policyVersionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await client.$queryRaw<PolicyRow[]>(Prisma.sql`
      SELECT *
      FROM simulated_activity_policy_versions
      WHERE id = ${policyVersionId}
      LIMIT 1
      ${lock}
    `);
    if (!rows[0]) {
      throw new NotFoundException('Simulated activity policy was not found.');
    }
    return rows[0];
  }

  private async requireSubscription(
    client: Prisma.TransactionClient,
    subscriptionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await client.$queryRaw<SubscriptionRow[]>(Prisma.sql`
      SELECT
        id, userId, packagePlanVersionId, packagePlanItemId,
        packageCode, packageDisplayName, status, activatedAt, scheduledEndAt
      FROM user_package_subscriptions
      WHERE id = ${subscriptionId}
      LIMIT 1
      ${lock}
    `);
    if (!rows[0]) {
      throw new NotFoundException('Package subscription was not found.');
    }
    return rows[0];
  }

  private normalizedPolicyConfig(row: PolicyRow): NormalizedPolicyConfig {
    return {
      enabled: Boolean(row.enabled),
      activitiesPerDay: Number(row.activitiesPerDay),
      assetSymbols: this.jsonArray<string>(row.assetSymbols, 'assetSymbols').map(
        (value) => String(value).trim().toUpperCase(),
      ),
      winWeight: Number(row.winWeight),
      lossWeight: Number(row.lossWeight),
      winMinimumPercent: this.percentString(row.winMinimumPercent),
      winMaximumPercent: this.percentString(row.winMaximumPercent),
      lossMinimumPercent: this.percentString(row.lossMinimumPercent),
      lossMaximumPercent: this.percentString(row.lossMaximumPercent),
      timingWindows: this.jsonArray<SimulatedTimingWindow>(
        row.timingWindows,
        'timingWindows',
      ).map((window) => ({
        start: window.start,
        end: window.end,
      })),
    };
  }

  private validatePolicyConfig(config: NormalizedPolicyConfig) {
    if (
      !Number.isInteger(config.activitiesPerDay) ||
      config.activitiesPerDay < 1 ||
      config.activitiesPerDay > SIMULATED_ACTIVITY_MAX_PER_DAY
    ) {
      throw new BadRequestException(
        `activitiesPerDay must be between 1 and ${SIMULATED_ACTIVITY_MAX_PER_DAY}.`,
      );
    }
    if (
      config.assetSymbols.length < 1 ||
      config.assetSymbols.length > 50 ||
      new Set(config.assetSymbols).size !== config.assetSymbols.length ||
      config.assetSymbols.some(
        (asset) => !/^[A-Z0-9._-]{2,32}$/.test(asset),
      )
    ) {
      throw new BadRequestException('Simulated asset symbols are invalid.');
    }
    if (
      !Number.isInteger(config.winWeight) ||
      !Number.isInteger(config.lossWeight) ||
      config.winWeight < 0 ||
      config.lossWeight < 0 ||
      config.winWeight + config.lossWeight <= 0
    ) {
      throw new BadRequestException('Simulated WIN/LOSS weights are invalid.');
    }

    const winMin = new Prisma.Decimal(config.winMinimumPercent);
    const winMax = new Prisma.Decimal(config.winMaximumPercent);
    const lossMin = new Prisma.Decimal(config.lossMinimumPercent);
    const lossMax = new Prisma.Decimal(config.lossMaximumPercent);
    if (
      winMin.lte(0) ||
      winMax.lt(winMin) ||
      winMax.gt(100) ||
      lossMin.lte(0) ||
      lossMax.lt(lossMin) ||
      lossMax.gt(100)
    ) {
      throw new BadRequestException(
        'Simulated WIN/LOSS percentage ranges must be positive, ordered and no greater than 100%.',
      );
    }

    validateTimingWindows(config.timingWindows, config.activitiesPerDay);
  }

  private policySnapshot(row: PolicyRow) {
    const config = this.normalizedPolicyConfig(row);
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      revision: row.revision,
      ...config,
      timezoneSnapshot: row.timezoneSnapshot,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      publishedAt: row.publishedAt,
      clonedFromPolicyVersionId: row.clonedFromPolicyVersionId,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      publishedByUserId: row.publishedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
      financialEffect: 'NONE' as const,
    };
  }

  private eventSnapshot(row: EventRow, admin: boolean) {
    const base = {
      id: row.id,
      sourceKey: row.sourceKey,
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      policyVersionId: row.policyVersionId,
      packagePlanVersionId: row.packagePlanVersionId,
      packagePlanItemId: row.packagePlanItemId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      localActivityDate: this.dateOnlyString(row.localActivityDate),
      slotNumber: row.slotNumber,
      scheduledAt: row.scheduledAt,
      timezoneSnapshot: row.timezoneSnapshot,
      assetSymbol: row.assetSymbol,
      outcome: row.outcome,
      resultPercent: this.percentString(row.resultPercent),
      generationSource: row.generationSource,
      generatedAt: row.generatedAt,
      createdAt: row.createdAt,
      disclosure: SIMULATED_ACTIVITY_DISCLOSURE,
      financialEffect: 'NONE' as const,
    };
    return admin
      ? {
          ...base,
          generatedByUserId: row.generatedByUserId,
          username: row.username,
          email: row.email,
        }
      : base;
  }

  private emptyBatch(
    asOf: Date,
    policy: PolicyRow | null,
    policyEnabled: boolean,
    noEffectivePolicy: boolean,
  ): SimulatedActivityBatchSummary {
    return {
      asOf: asOf.toISOString(),
      localActivityDate:
        policy?.timezoneSnapshot
          ? localDateForInstant(asOf, policy.timezoneSnapshot)
          : null,
      policyVersionId: policy?.id ?? null,
      policyVersionNumber: policy?.versionNumber ?? null,
      policyEnabled,
      eligibleSubscriptions: 0,
      processedSubscriptions: 0,
      remainingSubscriptions: 0,
      createdEvents: 0,
      alreadyPresent: 0,
      skippedNotDue: 0,
      noEffectivePolicy,
    };
  }

  private percentString(value: DecimalValue): string {
    return new Prisma.Decimal(value).toFixed(6);
  }

  private dateOnlyString(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
  }

  private jsonArray<T>(value: unknown, field: string): T[] {
    let parsed = value;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed) as unknown;
      } catch {
        throw new ServiceUnavailableException(
          `Stored simulated activity ${field} is invalid JSON.`,
        );
      }
    } else if (Buffer.isBuffer(parsed)) {
      try {
        parsed = JSON.parse(parsed.toString('utf8')) as unknown;
      } catch {
        throw new ServiceUnavailableException(
          `Stored simulated activity ${field} is invalid JSON.`,
        );
      }
    }
    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        `Stored simulated activity ${field} must be an array.`,
      );
    }
    return parsed as T[];
  }

  private countNumber(value: CountRow['total'] | undefined): number {
    return value === undefined ? 0 : Number(value);
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (
      let attempt = 1;
      attempt <= MAX_SERIALIZABLE_ATTEMPTS;
      attempt += 1
    ) {
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
