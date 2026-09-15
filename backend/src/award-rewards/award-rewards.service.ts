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
import { userWalletAccountKey } from '../wallet/wallet.constants';
import type {
  AdminAwardRewardEventQueryDto,
  AdminAwardRewardTrackQueryDto,
  AwardRewardTrackInputDto,
  CreateAwardRewardPolicyDraftDto,
  PublishAwardRewardPolicyDto,
  UpdateAwardRewardPolicyDto,
} from './dto/award-reward.dto';
import {
  AWARD_REWARD_AUDIT_OPERATIONS,
  AWARD_REWARD_DEFAULT_ASSET,
  awardRewardExpenseAccountKey,
  awardRewardSourceKey,
} from './award-rewards.constants';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const RECONCILIATION_BATCH_LIMIT = 100;

type DecimalValue = Prisma.Decimal | number | string;
type AwardActor = AuthenticatedUser | null;

interface CountRow {
  total: bigint | number | string;
}

interface AwardPolicyRow {
  id: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED';
  revision: number;
  enabled: boolean | number;
  levelCount: number;
  asset: string;
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

interface AwardPolicyTrackRow {
  id: string;
  policyVersionId: string;
  packageDefinitionId: string;
  packageCodeSnapshot: string;
  packageDisplayNameSnapshot: string;
  trackOrder: number;
  awardAmount: DecimalValue;
  createdAt: Date;
  updatedAt: Date;
}

interface AwardPolicyLevelRow {
  id: string;
  policyTrackId: string;
  levelNumber: number;
  requiredBusiness: DecimalValue | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PackageOptionRow {
  packageDefinitionId: string;
  packageCode: string;
  displayName: string;
  sortOrder: number;
  versionNumber: number;
}

interface AwardUserTrackRow {
  id: string;
  userId: string;
  policyVersionId: string;
  policyTrackId: string;
  sourceSubscriptionId: string;
  packageDefinitionId: string;
  packageCodeSnapshot: string;
  packageDisplayNameSnapshot: string;
  trackOrder: number;
  awardAmount: DecimalValue;
  currency: string;
  levelCount: number;
  status: 'ACTIVE_TRACK' | 'QUALIFIED' | 'AWARD_POSTED' | 'CLOSED';
  startedAt: Date;
  qualifiedAt: Date | null;
  awardPostedAt: Date | null;
  closedAt: Date | null;
  ledgerTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  username?: string;
  email?: string | null;
}

interface AwardProgressRow {
  id: string;
  userTrackId: string;
  levelNumber: number;
  requiredBusiness: DecimalValue | null;
  currentBusiness: DecimalValue;
  achievedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AwardEventRow {
  id: string;
  sourceKey: string;
  userTrackId: string;
  userId: string;
  policyVersionId: string;
  packageDefinitionId: string;
  packageCodeSnapshot: string;
  packageDisplayNameSnapshot: string;
  awardAmount: DecimalValue;
  currency: string;
  levelProgressSnapshot: Prisma.JsonValue | string;
  ledgerTransactionId: string;
  postedAt: Date;
  createdAt: Date;
  username?: string;
  email?: string | null;
}

interface CandidateTrackRow {
  sourceSubscriptionId: string;
  packageDefinitionId: string;
  packageCode: string;
  packageDisplayName: string;
  policyTrackId: string;
  trackOrder: number;
  awardAmount: DecimalValue;
}

interface BusinessTotalRow {
  total: DecimalValue;
}

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: string;
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

interface LedgerTransactionRow {
  id: string;
  kind: string;
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

interface LedgerEntryRow {
  side: 'DEBIT' | 'CREDIT';
  amount: DecimalValue;
}

interface ReconcileUserResult {
  userId: string;
  startedTrack: boolean;
  awardPosted: boolean;
  closedTrack: boolean;
  currentTrack: ReturnType<AwardRewardsService['userTrackSnapshot']> | null;
  message: string;
}

@Injectable()
export class AwardRewardsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPolicies() {
    const rows = await this.prisma.$queryRaw<AwardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_policy_versions
      ORDER BY versionNumber DESC
    `);

    return {
      policies: rows.map((row) => this.policySummary(row)),
    };
  }

  async getPolicy(policyVersionId: string) {
    return this.loadPolicySnapshot(this.prisma, policyVersionId);
  }

  async listPackageOptions() {
    const rows = await this.prisma.$queryRaw<PackageOptionRow[]>(Prisma.sql`
      SELECT
        pd.id AS packageDefinitionId,
        pd.code AS packageCode,
        ppi.displayName,
        ppi.sortOrder,
        ppv.versionNumber
      FROM package_definitions pd
      INNER JOIN package_plan_items ppi
        ON ppi.packageDefinitionId = pd.id
      INNER JOIN package_plan_versions ppv
        ON ppv.id = ppi.planVersionId
      WHERE ppv.status = 'PUBLISHED'
      ORDER BY ppv.versionNumber DESC, ppi.sortOrder ASC, pd.code ASC
    `);

    const seen = new Set<string>();
    const packages = rows.flatMap((row) => {
      if (seen.has(row.packageDefinitionId)) return [];
      seen.add(row.packageDefinitionId);
      return [
        {
          packageDefinitionId: row.packageDefinitionId,
          packageCode: row.packageCode,
          displayName: row.displayName,
          sortOrder: row.sortOrder,
        },
      ];
    });

    return { packages };
  }

  async createPolicyDraft(
    dto: CreateAwardRewardPolicyDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const nextRows = await transaction.$queryRaw<{ nextVersion: number }[]>(
        Prisma.sql`
          SELECT COALESCE(MAX(versionNumber), 0) + 1 AS nextVersion
          FROM award_reward_policy_versions
          FOR UPDATE
        `,
      );
      const versionNumber = Number(nextRows[0]?.nextVersion ?? 1);
      const policyId = randomUUID();
      let source: AwardPolicyRow | null = null;

      if (dto.sourcePolicyVersionId) {
        source = await this.requirePolicy(
          transaction,
          dto.sourcePolicyVersionId,
          false,
        );
      }

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO award_reward_policy_versions (
          id,
          versionNumber,
          status,
          revision,
          enabled,
          levelCount,
          asset,
          effectiveFrom,
          effectiveTo,
          publishedAt,
          clonedFromPolicyVersionId,
          createdByUserId,
          updatedByUserId,
          createdAt,
          updatedAt
        ) VALUES (
          ${policyId},
          ${versionNumber},
          'DRAFT',
          1,
          ${source ? this.booleanValue(source.enabled) : true},
          ${source?.levelCount ?? 1},
          ${source?.asset ?? AWARD_REWARD_DEFAULT_ASSET},
          NULL,
          NULL,
          NULL,
          ${source?.id ?? null},
          ${actor.id},
          ${actor.id},
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
      `);

      if (source) {
        const sourceTracks = await transaction.$queryRaw<
          AwardPolicyTrackRow[]
        >(Prisma.sql`
          SELECT *
          FROM award_reward_policy_tracks
          WHERE policyVersionId = ${source.id}
          ORDER BY trackOrder ASC
        `);

        for (const sourceTrack of sourceTracks) {
          const trackId = randomUUID();
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO award_reward_policy_tracks (
              id,
              policyVersionId,
              packageDefinitionId,
              packageCodeSnapshot,
              packageDisplayNameSnapshot,
              trackOrder,
              awardAmount,
              createdAt,
              updatedAt
            ) VALUES (
              ${trackId},
              ${policyId},
              ${sourceTrack.packageDefinitionId},
              ${sourceTrack.packageCodeSnapshot},
              ${sourceTrack.packageDisplayNameSnapshot},
              ${sourceTrack.trackOrder},
              ${this.moneyString(sourceTrack.awardAmount)},
              CURRENT_TIMESTAMP(3),
              CURRENT_TIMESTAMP(3)
            )
          `);

          const sourceLevels = await transaction.$queryRaw<
            AwardPolicyLevelRow[]
          >(Prisma.sql`
            SELECT *
            FROM award_reward_policy_levels
            WHERE policyTrackId = ${sourceTrack.id}
            ORDER BY levelNumber ASC
          `);

          for (const level of sourceLevels) {
            await transaction.$executeRaw(Prisma.sql`
              INSERT INTO award_reward_policy_levels (
                id,
                policyTrackId,
                levelNumber,
                requiredBusiness,
                createdAt,
                updatedAt
              ) VALUES (
                ${randomUUID()},
                ${trackId},
                ${level.levelNumber},
                ${
                  level.requiredBusiness === null
                    ? null
                    : this.moneyString(level.requiredBusiness)
                },
                CURRENT_TIMESTAMP(3),
                CURRENT_TIMESTAMP(3)
              )
            `);
          }
        }
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'AwardRewardPolicyVersion',
          entityId: policyId,
          description: 'SUPER_ADMIN created an Award & Reward policy draft.',
          metadata: {
            operation: AWARD_REWARD_AUDIT_OPERATIONS.CREATE_POLICY_DRAFT,
            reason: dto.reason,
            versionNumber,
            sourcePolicyVersionId: source?.id ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.loadPolicySnapshot(transaction, policyId);
    });
  }

  async updatePolicyDraft(
    policyVersionId: string,
    dto: UpdateAwardRewardPolicyDto,
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
        throw new ConflictException(
          'Published Award & Reward policy versions are immutable. Clone a new draft.',
        );
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Award & Reward policy changed concurrently. Reload before saving.',
        );
      }

      const matrix = await this.validateMatrix(
        transaction,
        dto.levelCount,
        dto.asset,
        dto.enabled,
        dto.tracks,
      );

      await transaction.$executeRaw(Prisma.sql`
        DELETE arpl
        FROM award_reward_policy_levels arpl
        INNER JOIN award_reward_policy_tracks arpt
          ON arpt.id = arpl.policyTrackId
        WHERE arpt.policyVersionId = ${policyVersionId}
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM award_reward_policy_tracks
        WHERE policyVersionId = ${policyVersionId}
      `);

      for (const track of matrix) {
        const trackId = randomUUID();
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO award_reward_policy_tracks (
            id,
            policyVersionId,
            packageDefinitionId,
            packageCodeSnapshot,
            packageDisplayNameSnapshot,
            trackOrder,
            awardAmount,
            createdAt,
            updatedAt
          ) VALUES (
            ${trackId},
            ${policyVersionId},
            ${track.packageDefinitionId},
            ${track.packageCode},
            ${track.packageDisplayName},
            ${track.trackOrder},
            ${track.awardAmount},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
        `);

        for (let index = 0; index < dto.levelCount; index += 1) {
          const input = track.levels[index];
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO award_reward_policy_levels (
              id,
              policyTrackId,
              levelNumber,
              requiredBusiness,
              createdAt,
              updatedAt
            ) VALUES (
              ${randomUUID()},
              ${trackId},
              ${index + 1},
              ${input},
              CURRENT_TIMESTAMP(3),
              CURRENT_TIMESTAMP(3)
            )
          `);
        }
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE award_reward_policy_versions
        SET
          enabled = ${dto.enabled},
          levelCount = ${dto.levelCount},
          asset = ${dto.asset.trim().toUpperCase()},
          revision = revision + 1,
          updatedByUserId = ${actor.id},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${dto.expectedRevision}
      `);
      if (updated !== 1) {
        throw new ConflictException(
          'Award & Reward policy changed concurrently. Reload before saving.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'AwardRewardPolicyVersion',
          entityId: policyVersionId,
          description: 'SUPER_ADMIN updated an Award & Reward policy draft.',
          metadata: {
            operation: AWARD_REWARD_AUDIT_OPERATIONS.UPDATE_POLICY_DRAFT,
            reason: dto.reason,
            levelCount: dto.levelCount,
            asset: dto.asset.trim().toUpperCase(),
            enabled: dto.enabled,
            packageTrackCount: matrix.length,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.loadPolicySnapshot(transaction, policyVersionId);
    });
  }

  async publishPolicy(
    policyVersionId: string,
    dto: PublishAwardRewardPolicyDto,
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
        throw new ConflictException(
          'Only a DRAFT Award & Reward policy can be published.',
        );
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Award & Reward policy changed concurrently. Reload before publishing.',
        );
      }

      await this.assertStoredMatrixExecutable(transaction, current);

      const now = new Date();
      const effectiveFrom = dto.effectiveFrom
        ? this.parseDate(dto.effectiveFrom, 'effectiveFrom')
        : now;
      const effectiveTo = dto.effectiveTo
        ? this.parseDate(dto.effectiveTo, 'effectiveTo')
        : null;

      if (dto.effectiveFrom && effectiveFrom.getTime() < now.getTime()) {
        throw new BadRequestException(
          'Award & Reward policy effectiveFrom cannot be backdated.',
        );
      }
      if (effectiveTo && effectiveTo <= effectiveFrom) {
        throw new BadRequestException(
          'effectiveTo must be after effectiveFrom.',
        );
      }

      const overlaps = await transaction.$queryRaw<AwardPolicyRow[]>(Prisma.sql`
        SELECT *
        FROM award_reward_policy_versions
        WHERE status = 'PUBLISHED'
          AND (effectiveTo IS NULL OR effectiveTo > ${effectiveFrom})
          AND (${effectiveTo} IS NULL OR effectiveFrom < ${effectiveTo})
        ORDER BY effectiveFrom ASC
        FOR UPDATE
      `);

      if (overlaps.length > 1) {
        throw new ConflictException(
          'Published Award & Reward policy ranges overlap; resolve configuration first.',
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
            'Award & Reward policy effective range overlaps an existing publication.',
          );
        }
        await transaction.$executeRaw(Prisma.sql`
          UPDATE award_reward_policy_versions
          SET effectiveTo = ${effectiveFrom}, updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${predecessor.id}
        `);
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE award_reward_policy_versions
        SET
          status = 'PUBLISHED',
          revision = revision + 1,
          effectiveFrom = ${effectiveFrom},
          effectiveTo = ${effectiveTo},
          publishedAt = CURRENT_TIMESTAMP(3),
          updatedByUserId = ${actor.id},
          publishedByUserId = ${actor.id},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${current.revision}
      `);
      if (updated !== 1) {
        throw new ConflictException(
          'Award & Reward policy changed concurrently. Reload before publishing.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'AwardRewardPolicyVersion',
          entityId: policyVersionId,
          description: 'SUPER_ADMIN published an Award & Reward policy.',
          metadata: {
            operation: AWARD_REWARD_AUDIT_OPERATIONS.PUBLISH_POLICY,
            reason: dto.reason,
            versionNumber: current.versionNumber,
            effectiveFrom: effectiveFrom.toISOString(),
            effectiveTo: effectiveTo?.toISOString() ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.loadPolicySnapshot(transaction, policyVersionId);
    });
  }

  async getMyAwards(userId: string) {
    const currentRows = await this.prisma.$queryRaw<
      AwardUserTrackRow[]
    >(Prisma.sql`
      SELECT *
      FROM award_reward_user_tracks
      WHERE userId = ${userId}
        AND status <> 'CLOSED'
      ORDER BY startedAt ASC
      LIMIT 1
    `);
    const current = currentRows[0] ?? null;
    const progress = current
      ? await this.loadProgress(this.prisma, current.id)
      : [];

    const completedRows = await this.prisma.$queryRaw<AwardUserTrackRow[]>(
      Prisma.sql`
        SELECT *
        FROM award_reward_user_tracks
        WHERE userId = ${userId}
          AND status = 'CLOSED'
        ORDER BY closedAt DESC, trackOrder DESC
      `,
    );

    const events = await this.prisma.$queryRaw<AwardEventRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_events
      WHERE userId = ${userId}
      ORDER BY postedAt DESC, id DESC
      LIMIT 100
    `);

    const asOf = new Date();
    const effectivePolicy = await this.findEffectivePolicy(this.prisma, asOf);
    const waiting = effectivePolicy
      ? await this.loadWaitingCandidates(
          this.prisma,
          userId,
          effectivePolicy.id,
        )
      : [];

    const balanceRows = await this.prisma.$queryRaw<
      BusinessTotalRow[]
    >(Prisma.sql`
      SELECT COALESCE(lb.balance, 0.00000000) AS total
      FROM ledger_accounts la
      LEFT JOIN ledger_account_balances lb ON lb.accountId = la.id
      WHERE la.accountKey = ${userWalletAccountKey(
        userId,
        'REWARDS',
        effectivePolicy?.asset ?? AWARD_REWARD_DEFAULT_ASSET,
      )}
      LIMIT 1
    `);

    return {
      currentTrack: current
        ? {
            ...this.userTrackSnapshot(current),
            levels: progress.map((row) => this.progressSnapshot(row)),
          }
        : null,
      waitingTracks: waiting.map((row) => this.candidateSnapshot(row)),
      completedTracks: completedRows.map((row) => this.userTrackSnapshot(row)),
      events: events.map((row) => this.eventSnapshot(row, false)),
      effectivePolicy: effectivePolicy
        ? this.policySummary(effectivePolicy)
        : null,
      rewardsWalletBalance: this.moneyString(balanceRows[0]?.total ?? 0),
    };
  }

  async listTracks(query: AdminAwardRewardTrackQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND aut.userId = ${query.userId}`
      : Prisma.empty;
    const statusFilter = query.status
      ? Prisma.sql`AND aut.status = ${query.status}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<AwardUserTrackRow[]>(Prisma.sql`
      SELECT aut.*, u.username, u.email
      FROM award_reward_user_tracks aut
      INNER JOIN users u ON u.id = aut.userId
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
      ORDER BY
        FIELD(aut.status, 'QUALIFIED', 'AWARD_POSTED', 'ACTIVE_TRACK', 'CLOSED'),
        aut.startedAt ASC,
        aut.id ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM award_reward_user_tracks aut
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
    `);

    return {
      tracks: rows.map((row) => this.userTrackSnapshot(row, true)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async listEvents(query: AdminAwardRewardEventQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND are.userId = ${query.userId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<AwardEventRow[]>(Prisma.sql`
      SELECT are.*, u.username, u.email
      FROM award_reward_events are
      INNER JOIN users u ON u.id = are.userId
      WHERE 1 = 1
        ${userFilter}
      ORDER BY are.postedAt DESC, are.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM award_reward_events are
      WHERE 1 = 1
        ${userFilter}
    `);

    return {
      events: rows.map((row) => this.eventSnapshot(row, true)),
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
    };
  }

  async reconcile(
    userId: string | undefined,
    actor: AwardActor,
    context: RequestContext = {},
    automatic = false,
  ) {
    const userIds = userId ? [userId] : await this.loadReconciliationUserIds();

    let startedTracks = 0;
    let awardsPosted = 0;
    let closedTracks = 0;
    const results: ReconcileUserResult[] = [];

    for (const candidateUserId of userIds) {
      const result = await this.reconcileUser(
        candidateUserId,
        actor,
        context,
        automatic,
      );
      if (result.startedTrack) startedTracks += 1;
      if (result.awardPosted) awardsPosted += 1;
      if (result.closedTrack) closedTracks += 1;
      results.push(result);
    }

    return {
      asOf: new Date().toISOString(),
      usersProcessed: userIds.length,
      startedTracks,
      awardsPosted,
      closedTracks,
      results,
    };
  }

  private async reconcileUser(
    userId: string,
    actor: AwardActor,
    context: RequestContext,
    automatic: boolean,
  ): Promise<ReconcileUserResult> {
    return this.runSerializable(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id
        FROM users
        WHERE id = ${userId}
        FOR UPDATE
      `);

      const userRows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `);
      if (userRows.length === 0) {
        throw new NotFoundException('Award & Reward user was not found.');
      }

      let startedTrack = false;
      let awardPosted = false;
      let closedTrack = false;
      let current = await this.findOpenUserTrack(transaction, userId, true);

      if (!current) {
        const effectivePolicy = await this.findEffectivePolicy(
          transaction,
          new Date(),
          true,
        );
        if (!effectivePolicy || !this.booleanValue(effectivePolicy.enabled)) {
          return {
            userId,
            startedTrack: false,
            awardPosted: false,
            closedTrack: false,
            currentTrack: null,
            message: 'No enabled published Award & Reward policy is effective.',
          };
        }

        const candidate = await this.findNextCandidate(
          transaction,
          userId,
          effectivePolicy,
        );
        if (!candidate) {
          return {
            userId,
            startedTrack: false,
            awardPosted: false,
            closedTrack: false,
            currentTrack: null,
            message:
              'No next eligible ACTIVE package award track is available.',
          };
        }

        current = await this.startTrack(
          transaction,
          userId,
          effectivePolicy,
          candidate,
          actor,
          context,
          automatic,
        );
        startedTrack = true;
      }

      const progress = await this.recalculateProgress(transaction, current);
      const requiredLevels = progress.filter(
        (row) => row.requiredBusiness !== null,
      );
      const allAchieved =
        requiredLevels.length > 0 &&
        requiredLevels.every((row) => row.achievedAt !== null);

      if (allAchieved && current.status === 'ACTIVE_TRACK') {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE award_reward_user_tracks
          SET
            status = 'QUALIFIED',
            qualifiedAt = CURRENT_TIMESTAMP(3),
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${current.id}
            AND status = 'ACTIVE_TRACK'
        `);
        current = await this.requireUserTrack(transaction, current.id, true);
      }

      if (current.status === 'QUALIFIED' || current.status === 'AWARD_POSTED') {
        const post = await this.postAward(
          transaction,
          current,
          progress,
          actor,
          context,
          automatic,
        );
        awardPosted = post.created;
        closedTrack = true;
        current = post.track;
      }

      if (current.status === 'CLOSED') {
        const effectivePolicy = await this.findEffectivePolicy(
          transaction,
          new Date(),
          true,
        );
        if (effectivePolicy && this.booleanValue(effectivePolicy.enabled)) {
          const next = await this.findNextCandidate(
            transaction,
            userId,
            effectivePolicy,
          );
          if (next) {
            const nextTrack = await this.startTrack(
              transaction,
              userId,
              effectivePolicy,
              next,
              actor,
              context,
              automatic,
            );
            startedTrack = true;
            return {
              userId,
              startedTrack,
              awardPosted,
              closedTrack,
              currentTrack: this.userTrackSnapshot(nextTrack),
              message:
                'Award track closed and the next eligible ACTIVE package track started from zero.',
            };
          }
        }
      }

      return {
        userId,
        startedTrack,
        awardPosted,
        closedTrack,
        currentTrack:
          current.status === 'CLOSED' ? null : this.userTrackSnapshot(current),
        message: awardPosted
          ? 'Award posted idempotently and package track closed.'
          : startedTrack
            ? 'Eligible package Award & Reward track started from zero.'
            : 'Award & Reward progress reconciled.',
      };
    });
  }

  private async startTrack(
    transaction: Prisma.TransactionClient,
    userId: string,
    policy: AwardPolicyRow,
    candidate: CandidateTrackRow,
    actor: AwardActor,
    context: RequestContext,
    automatic: boolean,
  ) {
    const existingRows = await transaction.$queryRaw<AwardUserTrackRow[]>(
      Prisma.sql`
        SELECT *
        FROM award_reward_user_tracks
        WHERE userId = ${userId}
          AND packageDefinitionId = ${candidate.packageDefinitionId}
        LIMIT 1
        FOR UPDATE
      `,
    );
    if (existingRows[0]) return existingRows[0];

    const trackId = randomUUID();
    const startedAt = new Date();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO award_reward_user_tracks (
        id,
        userId,
        policyVersionId,
        policyTrackId,
        sourceSubscriptionId,
        packageDefinitionId,
        packageCodeSnapshot,
        packageDisplayNameSnapshot,
        trackOrder,
        awardAmount,
        currency,
        levelCount,
        status,
        startedAt,
        createdAt,
        updatedAt
      ) VALUES (
        ${trackId},
        ${userId},
        ${policy.id},
        ${candidate.policyTrackId},
        ${candidate.sourceSubscriptionId},
        ${candidate.packageDefinitionId},
        ${candidate.packageCode},
        ${candidate.packageDisplayName},
        ${candidate.trackOrder},
        ${this.moneyString(candidate.awardAmount)},
        ${policy.asset},
        ${policy.levelCount},
        'ACTIVE_TRACK',
        ${startedAt},
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      )
    `);

    const levels = await transaction.$queryRaw<
      AwardPolicyLevelRow[]
    >(Prisma.sql`
      SELECT *
      FROM award_reward_policy_levels
      WHERE policyTrackId = ${candidate.policyTrackId}
      ORDER BY levelNumber ASC
    `);

    for (const level of levels) {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO award_reward_user_level_progress (
          id,
          userTrackId,
          levelNumber,
          requiredBusiness,
          currentBusiness,
          achievedAt,
          createdAt,
          updatedAt
        ) VALUES (
          ${randomUUID()},
          ${trackId},
          ${level.levelNumber},
          ${
            level.requiredBusiness === null
              ? null
              : this.moneyString(level.requiredBusiness)
          },
          0.00000000,
          ${level.requiredBusiness === null ? startedAt : null},
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
      `);
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        action: 'CREATE',
        entityType: 'AwardRewardUserTrack',
        entityId: trackId,
        description:
          'Sequential Award & Reward package track started from zero.',
        metadata: {
          operation: AWARD_REWARD_AUDIT_OPERATIONS.START_TRACK,
          automatic,
          userId,
          policyVersionId: policy.id,
          packageDefinitionId: candidate.packageDefinitionId,
          packageCode: candidate.packageCode,
          packageDisplayName: candidate.packageDisplayName,
          trackOrder: candidate.trackOrder,
          awardAmount: this.moneyString(candidate.awardAmount),
          currency: policy.asset,
          startedAt: startedAt.toISOString(),
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return this.requireUserTrack(transaction, trackId, false);
  }

  private async recalculateProgress(
    transaction: Prisma.TransactionClient,
    track: AwardUserTrackRow,
  ) {
    const progress = await this.loadProgress(transaction, track.id, true);
    let parentUserIds = [track.userId];

    for (
      let levelNumber = 1;
      levelNumber <= track.levelCount;
      levelNumber += 1
    ) {
      const children = await transaction.referralProfile.findMany({
        where: { sponsorUserId: { in: parentUserIds } },
        select: { userId: true },
      });
      const levelUserIds = children.map((child) => child.userId);
      const progressRow = progress.find(
        (row) => row.levelNumber === levelNumber,
      );
      if (!progressRow) {
        throw new ServiceUnavailableException(
          `Award progress row for level ${levelNumber} is missing.`,
        );
      }

      let currentBusiness = new Prisma.Decimal(0);
      if (levelUserIds.length > 0) {
        const totals = await transaction.$queryRaw<
          BusinessTotalRow[]
        >(Prisma.sql`
          SELECT COALESCE(SUM(price), 0.00000000) AS total
          FROM user_package_subscriptions
          WHERE userId IN (${Prisma.join(levelUserIds)})
            AND activatedAt >= ${track.startedAt}
            AND status <> 'CANCELLED'
        `);
        currentBusiness = new Prisma.Decimal(totals[0]?.total ?? 0);
      }

      const required =
        progressRow.requiredBusiness === null
          ? null
          : new Prisma.Decimal(progressRow.requiredBusiness);
      const achieved =
        progressRow.achievedAt !== null ||
        required === null ||
        currentBusiness.greaterThanOrEqualTo(required);
      const achievedAt =
        progressRow.achievedAt ?? (achieved ? new Date() : null);

      await transaction.$executeRaw(Prisma.sql`
        UPDATE award_reward_user_level_progress
        SET
          currentBusiness = ${currentBusiness.toFixed(8)},
          achievedAt = ${achievedAt},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${progressRow.id}
      `);

      parentUserIds = levelUserIds;
      if (parentUserIds.length === 0) {
        for (
          let remaining = levelNumber + 1;
          remaining <= track.levelCount;
          remaining += 1
        ) {
          const remainingRow = progress.find(
            (row) => row.levelNumber === remaining,
          );
          if (remainingRow) {
            await transaction.$executeRaw(Prisma.sql`
              UPDATE award_reward_user_level_progress
              SET
                currentBusiness = 0.00000000,
                achievedAt = CASE
                  WHEN requiredBusiness IS NULL THEN COALESCE(achievedAt, CURRENT_TIMESTAMP(3))
                  ELSE achievedAt
                END,
                updatedAt = CURRENT_TIMESTAMP(3)
              WHERE id = ${remainingRow.id}
            `);
          }
        }
        break;
      }
    }

    return this.loadProgress(transaction, track.id, false);
  }

  private async postAward(
    transaction: Prisma.TransactionClient,
    track: AwardUserTrackRow,
    progress: AwardProgressRow[],
    actor: AwardActor,
    context: RequestContext,
    automatic: boolean,
  ) {
    const sourceKey = awardRewardSourceKey(track.id);
    const existingEvents = await transaction.$queryRaw<
      AwardEventRow[]
    >(Prisma.sql`
      SELECT *
      FROM award_reward_events
      WHERE sourceKey = ${sourceKey}
      LIMIT 1
      FOR UPDATE
    `);
    if (existingEvents[0]) {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE award_reward_user_tracks
        SET
          status = 'CLOSED',
          qualifiedAt = COALESCE(qualifiedAt, ${existingEvents[0].postedAt}),
          awardPostedAt = COALESCE(awardPostedAt, ${existingEvents[0].postedAt}),
          ledgerTransactionId = ${existingEvents[0].ledgerTransactionId},
          closedAt = COALESCE(closedAt, ${existingEvents[0].postedAt}),
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${track.id}
      `);
      return {
        created: false,
        track: await this.requireUserTrack(transaction, track.id, false),
      };
    }

    const amount = this.moneyString(track.awardAmount);
    const ledgerTransactionId = randomUUID();
    const metadata = {
      userTrackId: track.id,
      userId: track.userId,
      policyVersionId: track.policyVersionId,
      packageDefinitionId: track.packageDefinitionId,
      packageCode: track.packageCodeSnapshot,
      packageDisplayName: track.packageDisplayNameSnapshot,
      trackOrder: track.trackOrder,
      awardAmount: amount,
      currency: track.currency,
      startedAt: track.startedAt.toISOString(),
      qualification: progress.map((row) => this.progressSnapshot(row)),
    };

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
        'AWARD_REWARD_CREDIT',
        ${sourceKey},
        'AWARD_REWARD_TRACK',
        ${track.id},
        ${track.currency},
        ${actor?.id ?? null},
        ${`Award & Reward achievement credited for ${track.packageDisplayNameSnapshot}.`},
        ${JSON.stringify(metadata)},
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE sourceKey = VALUES(sourceKey)
    `);

    const ledgerRows = await transaction.$queryRaw<
      LedgerTransactionRow[]
    >(Prisma.sql`
      SELECT *
      FROM ledger_transactions
      WHERE sourceKey = ${sourceKey}
      LIMIT 1
      FOR UPDATE
    `);
    const ledger = ledgerRows[0];
    if (!ledger) {
      throw new ServiceUnavailableException(
        'Award ledger transaction could not be established.',
      );
    }

    const entryCounts = await transaction.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM ledger_entries
      WHERE transactionId = ${ledger.id}
    `);
    if (this.countNumber(entryCounts[0]?.total) === 0) {
      const expense = await this.ensureLedgerAccount(transaction, {
        accountKey: awardRewardExpenseAccountKey(track.currency),
        ownerType: 'SYSTEM',
        ownerUserId: null,
        bucket: 'AWARD_REWARD_EXPENSE',
        currency: track.currency,
        normalSide: 'DEBIT',
      });
      const rewards = await this.ensureLedgerAccount(transaction, {
        accountKey: userWalletAccountKey(
          track.userId,
          'REWARDS',
          track.currency,
        ),
        ownerType: 'USER',
        ownerUserId: track.userId,
        bucket: 'REWARDS',
        currency: track.currency,
        normalSide: 'CREDIT',
      });

      await this.insertLedgerEntry(
        transaction,
        ledger.id,
        expense.id,
        'DEBIT',
        amount,
        `Award & Reward expense for ${track.packageDisplayNameSnapshot}.`,
      );
      await this.insertLedgerEntry(
        transaction,
        ledger.id,
        rewards.id,
        'CREDIT',
        amount,
        `Award & Reward credit for ${track.packageDisplayNameSnapshot}.`,
      );
      await this.applyBalance(transaction, expense, 'DEBIT', amount);
      await this.applyBalance(transaction, rewards, 'CREDIT', amount);

      const entries = await transaction.$queryRaw<LedgerEntryRow[]>(Prisma.sql`
        SELECT side, amount
        FROM ledger_entries
        WHERE transactionId = ${ledger.id}
        ORDER BY createdAt ASC, id ASC
      `);
      if (!this.entriesBalanced(entries)) {
        throw new ServiceUnavailableException(
          'Award ledger transaction is not balanced; posting was aborted.',
        );
      }
    }

    const eventId = randomUUID();
    const postedAt = ledger.postedAt;
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO award_reward_events (
        id,
        sourceKey,
        userTrackId,
        userId,
        policyVersionId,
        packageDefinitionId,
        packageCodeSnapshot,
        packageDisplayNameSnapshot,
        awardAmount,
        currency,
        levelProgressSnapshot,
        ledgerTransactionId,
        postedAt,
        createdAt
      ) VALUES (
        ${eventId},
        ${sourceKey},
        ${track.id},
        ${track.userId},
        ${track.policyVersionId},
        ${track.packageDefinitionId},
        ${track.packageCodeSnapshot},
        ${track.packageDisplayNameSnapshot},
        ${amount},
        ${track.currency},
        ${JSON.stringify(metadata.qualification)},
        ${ledger.id},
        ${postedAt},
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE sourceKey = VALUES(sourceKey)
    `);

    await transaction.$executeRaw(Prisma.sql`
      UPDATE award_reward_user_tracks
      SET
        status = 'AWARD_POSTED',
        qualifiedAt = COALESCE(qualifiedAt, ${postedAt}),
        awardPostedAt = ${postedAt},
        ledgerTransactionId = ${ledger.id},
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE id = ${track.id}
    `);
    await transaction.$executeRaw(Prisma.sql`
      UPDATE award_reward_user_tracks
      SET
        status = 'CLOSED',
        closedAt = ${postedAt},
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE id = ${track.id}
        AND status = 'AWARD_POSTED'
    `);

    await transaction.auditLog.create({
      data: {
        actorUserId: actor?.id ?? null,
        action: 'CREATE',
        entityType: 'AwardRewardEvent',
        entityId: eventId,
        description:
          'Qualified Team Business Award & Reward posted to USER Rewards wallet.',
        metadata: {
          operation: AWARD_REWARD_AUDIT_OPERATIONS.POST_AWARD,
          automatic,
          sourceKey,
          userTrackId: track.id,
          userId: track.userId,
          packageDefinitionId: track.packageDefinitionId,
          packageCode: track.packageCodeSnapshot,
          awardAmount: amount,
          currency: track.currency,
          ledgerTransactionId: ledger.id,
          balanced: true,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      created: true,
      track: await this.requireUserTrack(transaction, track.id, false),
    };
  }

  private async findNextCandidate(
    transaction: Prisma.TransactionClient,
    userId: string,
    policy: AwardPolicyRow,
  ): Promise<CandidateTrackRow | null> {
    const maxRows = await transaction.$queryRaw<{ maxOrder: number | null }[]>(
      Prisma.sql`
        SELECT MAX(trackOrder) AS maxOrder
        FROM award_reward_user_tracks
        WHERE userId = ${userId}
      `,
    );
    const maxOrder = Number(maxRows[0]?.maxOrder ?? 0);

    const rows = await transaction.$queryRaw<CandidateTrackRow[]>(Prisma.sql`
      SELECT
        ups.id AS sourceSubscriptionId,
        ups.packageDefinitionId,
        ups.packageCode,
        ups.packageDisplayName,
        arpt.id AS policyTrackId,
        arpt.trackOrder,
        arpt.awardAmount
      FROM user_package_subscriptions ups
      INNER JOIN award_reward_policy_tracks arpt
        ON arpt.packageDefinitionId = ups.packageDefinitionId
       AND arpt.policyVersionId = ${policy.id}
      LEFT JOIN award_reward_user_tracks existing
        ON existing.userId = ups.userId
       AND existing.packageDefinitionId = ups.packageDefinitionId
      WHERE ups.userId = ${userId}
        AND ups.status = 'ACTIVE'
        AND arpt.trackOrder > ${maxOrder}
        AND existing.id IS NULL
      ORDER BY arpt.trackOrder ASC, ups.activatedAt ASC, ups.id ASC
      LIMIT 1
      FOR UPDATE
    `);
    return rows[0] ?? null;
  }

  private async loadWaitingCandidates(
    client: PrismaService | Prisma.TransactionClient,
    userId: string,
    policyVersionId: string,
  ) {
    const maxRows = await client.$queryRaw<
      { maxOrder: number | null }[]
    >(Prisma.sql`
      SELECT MAX(trackOrder) AS maxOrder
      FROM award_reward_user_tracks
      WHERE userId = ${userId}
    `);
    const maxOrder = Number(maxRows[0]?.maxOrder ?? 0);

    return client.$queryRaw<CandidateTrackRow[]>(Prisma.sql`
      SELECT
        ups.id AS sourceSubscriptionId,
        ups.packageDefinitionId,
        ups.packageCode,
        ups.packageDisplayName,
        arpt.id AS policyTrackId,
        arpt.trackOrder,
        arpt.awardAmount
      FROM user_package_subscriptions ups
      INNER JOIN award_reward_policy_tracks arpt
        ON arpt.packageDefinitionId = ups.packageDefinitionId
       AND arpt.policyVersionId = ${policyVersionId}
      LEFT JOIN award_reward_user_tracks existing
        ON existing.userId = ups.userId
       AND existing.packageDefinitionId = ups.packageDefinitionId
      WHERE ups.userId = ${userId}
        AND ups.status = 'ACTIVE'
        AND arpt.trackOrder > ${maxOrder}
        AND existing.id IS NULL
      ORDER BY arpt.trackOrder ASC, ups.activatedAt ASC, ups.id ASC
    `);
  }

  private async loadReconciliationUserIds(): Promise<string[]> {
    const effectivePolicy = await this.findEffectivePolicy(
      this.prisma,
      new Date(),
    );
    if (!effectivePolicy || !this.booleanValue(effectivePolicy.enabled))
      return [];

    const rows = await this.prisma.$queryRaw<{ userId: string }[]>(Prisma.sql`
      SELECT DISTINCT candidate.userId
      FROM (
        SELECT userId
        FROM award_reward_user_tracks
        WHERE status <> 'CLOSED'
        UNION
        SELECT ups.userId
        FROM user_package_subscriptions ups
        INNER JOIN award_reward_policy_tracks arpt
          ON arpt.packageDefinitionId = ups.packageDefinitionId
         AND arpt.policyVersionId = ${effectivePolicy.id}
        WHERE ups.status = 'ACTIVE'
      ) candidate
      ORDER BY candidate.userId ASC
      LIMIT ${RECONCILIATION_BATCH_LIMIT}
    `);
    return rows.map((row) => row.userId);
  }

  private async validateMatrix(
    transaction: Prisma.TransactionClient,
    levelCount: number,
    asset: string,
    enabled: boolean,
    tracks: AwardRewardTrackInputDto[],
  ) {
    const normalizedAsset = asset.trim().toUpperCase();
    if (!normalizedAsset) {
      throw new BadRequestException('Award asset is required.');
    }
    if (enabled && tracks.length === 0) {
      throw new BadRequestException(
        'An enabled Award & Reward policy requires at least one package track.',
      );
    }

    const packageIds = new Set<string>();
    const orders = new Set<number>();
    for (const track of tracks) {
      if (packageIds.has(track.packageDefinitionId)) {
        throw new BadRequestException(
          'Each package may appear only once in an Award & Reward policy.',
        );
      }
      if (orders.has(track.trackOrder)) {
        throw new BadRequestException(
          'Each Award & Reward package track must have a unique order.',
        );
      }
      packageIds.add(track.packageDefinitionId);
      orders.add(track.trackOrder);
      if (track.levels.length !== levelCount) {
        throw new BadRequestException(
          `Package track order ${track.trackOrder} must define exactly ${levelCount} level entries.`,
        );
      }
      if (
        !track.levels.some(
          (level) =>
            level.requiredBusiness !== null &&
            level.requiredBusiness !== undefined &&
            level.requiredBusiness !== '',
        )
      ) {
        throw new BadRequestException(
          `Package track order ${track.trackOrder} must require team business on at least one level.`,
        );
      }
    }

    const metadata = await this.resolvePackageMetadata(
      transaction,
      Array.from(packageIds),
    );

    return tracks
      .map((track) => {
        const packageMeta = metadata.get(track.packageDefinitionId);
        if (!packageMeta) {
          throw new BadRequestException(
            'Every Award & Reward package must exist in a published package plan.',
          );
        }
        const awardAmount = new Prisma.Decimal(track.awardAmount);
        if (awardAmount.lte(0)) {
          throw new BadRequestException(
            'Award amount must be greater than zero.',
          );
        }
        const levels = track.levels.map((level) => {
          const raw = level.requiredBusiness;
          if (raw === null || raw === undefined || raw === '') return null;
          const amount = new Prisma.Decimal(raw);
          if (amount.lte(0)) {
            throw new BadRequestException(
              'Required team business must be greater than zero or NOT_REQUIRED.',
            );
          }
          return amount.toFixed(8);
        });
        return {
          packageDefinitionId: track.packageDefinitionId,
          packageCode: packageMeta.packageCode,
          packageDisplayName: packageMeta.displayName,
          trackOrder: track.trackOrder,
          awardAmount: awardAmount.toFixed(8),
          levels,
        };
      })
      .sort((left, right) => left.trackOrder - right.trackOrder);
  }

  private async resolvePackageMetadata(
    transaction: Prisma.TransactionClient,
    packageDefinitionIds: string[],
  ) {
    if (packageDefinitionIds.length === 0) {
      return new Map<string, PackageOptionRow>();
    }

    const rows = await transaction.$queryRaw<PackageOptionRow[]>(Prisma.sql`
      SELECT
        pd.id AS packageDefinitionId,
        pd.code AS packageCode,
        ppi.displayName,
        ppi.sortOrder,
        ppv.versionNumber
      FROM package_definitions pd
      INNER JOIN package_plan_items ppi
        ON ppi.packageDefinitionId = pd.id
      INNER JOIN package_plan_versions ppv
        ON ppv.id = ppi.planVersionId
      WHERE pd.id IN (${Prisma.join(packageDefinitionIds)})
        AND ppv.status = 'PUBLISHED'
      ORDER BY ppv.versionNumber DESC, ppi.sortOrder ASC
    `);

    const result = new Map<string, PackageOptionRow>();
    for (const row of rows) {
      if (!result.has(row.packageDefinitionId)) {
        result.set(row.packageDefinitionId, row);
      }
    }
    return result;
  }

  private async assertStoredMatrixExecutable(
    transaction: Prisma.TransactionClient,
    policy: AwardPolicyRow,
  ) {
    if (!this.booleanValue(policy.enabled)) return;
    const tracks = await transaction.$queryRaw<
      AwardPolicyTrackRow[]
    >(Prisma.sql`
      SELECT *
      FROM award_reward_policy_tracks
      WHERE policyVersionId = ${policy.id}
      ORDER BY trackOrder ASC
    `);
    if (tracks.length === 0) {
      throw new BadRequestException(
        'An enabled Award & Reward policy requires at least one package track.',
      );
    }
    for (const track of tracks) {
      const levels = await transaction.$queryRaw<
        AwardPolicyLevelRow[]
      >(Prisma.sql`
        SELECT *
        FROM award_reward_policy_levels
        WHERE policyTrackId = ${track.id}
        ORDER BY levelNumber ASC
      `);
      if (levels.length !== policy.levelCount) {
        throw new BadRequestException(
          `Award package ${track.packageCodeSnapshot} does not match policy levelCount.`,
        );
      }
      if (!levels.some((level) => level.requiredBusiness !== null)) {
        throw new BadRequestException(
          `Award package ${track.packageCodeSnapshot} requires at least one team-business threshold.`,
        );
      }
    }
  }

  private async loadPolicySnapshot(
    client: PrismaService | Prisma.TransactionClient,
    policyVersionId: string,
  ) {
    const policyRows = await client.$queryRaw<AwardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_policy_versions
      WHERE id = ${policyVersionId}
      LIMIT 1
    `);
    const policy = policyRows[0];
    if (!policy) {
      throw new NotFoundException('Award & Reward policy was not found.');
    }

    const tracks = await client.$queryRaw<AwardPolicyTrackRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_policy_tracks
      WHERE policyVersionId = ${policyVersionId}
      ORDER BY trackOrder ASC, id ASC
    `);

    const result = [];
    for (const track of tracks) {
      const levels = await client.$queryRaw<AwardPolicyLevelRow[]>(Prisma.sql`
        SELECT *
        FROM award_reward_policy_levels
        WHERE policyTrackId = ${track.id}
        ORDER BY levelNumber ASC
      `);
      result.push({
        id: track.id,
        packageDefinitionId: track.packageDefinitionId,
        packageCode: track.packageCodeSnapshot,
        packageDisplayName: track.packageDisplayNameSnapshot,
        trackOrder: track.trackOrder,
        awardAmount: this.moneyString(track.awardAmount),
        levels: levels.map((level) => ({
          levelNumber: level.levelNumber,
          requiredBusiness:
            level.requiredBusiness === null
              ? null
              : this.moneyString(level.requiredBusiness),
          required: level.requiredBusiness !== null,
        })),
      });
    }

    return {
      ...this.policySummary(policy),
      tracks: result,
    };
  }

  private async requirePolicy(
    transaction: Prisma.TransactionClient,
    policyVersionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<AwardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_policy_versions
      WHERE id = ${policyVersionId}
      LIMIT 1
      ${lock}
    `);
    const row = rows[0];
    if (!row)
      throw new NotFoundException('Award & Reward policy was not found.');
    return row;
  }

  private async findEffectivePolicy(
    client: PrismaService | Prisma.TransactionClient,
    asOf: Date,
    forUpdate = false,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR SHARE` : Prisma.empty;
    const rows = await client.$queryRaw<AwardPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_policy_versions
      WHERE status = 'PUBLISHED'
        AND enabled = TRUE
        AND effectiveFrom <= ${asOf}
        AND (effectiveTo IS NULL OR effectiveTo > ${asOf})
      ORDER BY effectiveFrom DESC, versionNumber DESC
      LIMIT 1
      ${lock}
    `);
    return rows[0] ?? null;
  }

  private async findOpenUserTrack(
    transaction: Prisma.TransactionClient,
    userId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<AwardUserTrackRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_user_tracks
      WHERE userId = ${userId}
        AND status <> 'CLOSED'
      ORDER BY startedAt ASC
      LIMIT 1
      ${lock}
    `);
    return rows[0] ?? null;
  }

  private async requireUserTrack(
    transaction: Prisma.TransactionClient,
    userTrackId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<AwardUserTrackRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_user_tracks
      WHERE id = ${userTrackId}
      LIMIT 1
      ${lock}
    `);
    const row = rows[0];
    if (!row) {
      throw new ServiceUnavailableException('Award user track was not found.');
    }
    return row;
  }

  private async loadProgress(
    client: PrismaService | Prisma.TransactionClient,
    userTrackId: string,
    forUpdate = false,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    return client.$queryRaw<AwardProgressRow[]>(Prisma.sql`
      SELECT *
      FROM award_reward_user_level_progress
      WHERE userTrackId = ${userTrackId}
      ORDER BY levelNumber ASC
      ${lock}
    `);
  }

  private async ensureLedgerAccount(
    transaction: Prisma.TransactionClient,
    input: Omit<LedgerAccountRow, 'id'>,
  ) {
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
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);

    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
      FROM ledger_accounts
      WHERE accountKey = ${input.accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];
    if (!account) {
      throw new ServiceUnavailableException(
        'Award ledger account could not be established.',
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
        'Award ledger account key conflicts with existing account semantics.',
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
    account: LedgerAccountRow,
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
        `Award ledger balance update was rejected for ${account.accountKey}.`,
      );
    }
  }

  private entriesBalanced(entries: LedgerEntryRow[]) {
    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    for (const entry of entries) {
      const amount = new Prisma.Decimal(entry.amount);
      if (entry.side === 'DEBIT') debits = debits.plus(amount);
      if (entry.side === 'CREDIT') credits = credits.plus(amount);
    }
    return entries.length >= 2 && debits.equals(credits);
  }

  private policySummary(row: AwardPolicyRow) {
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      revision: row.revision,
      enabled: this.booleanValue(row.enabled),
      levelCount: row.levelCount,
      asset: row.asset,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      publishedAt: row.publishedAt,
      clonedFromPolicyVersionId: row.clonedFromPolicyVersionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private userTrackSnapshot(row: AwardUserTrackRow, admin = false) {
    return {
      id: row.id,
      userId: row.userId,
      ...(admin ? { username: row.username, email: row.email } : {}),
      policyVersionId: row.policyVersionId,
      policyTrackId: row.policyTrackId,
      sourceSubscriptionId: row.sourceSubscriptionId,
      packageDefinitionId: row.packageDefinitionId,
      packageCode: row.packageCodeSnapshot,
      packageDisplayName: row.packageDisplayNameSnapshot,
      trackOrder: row.trackOrder,
      awardAmount: this.moneyString(row.awardAmount),
      currency: row.currency,
      levelCount: row.levelCount,
      status: row.status,
      startedAt: row.startedAt,
      qualifiedAt: row.qualifiedAt,
      awardPostedAt: row.awardPostedAt,
      closedAt: row.closedAt,
      ledgerTransactionId: row.ledgerTransactionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private progressSnapshot(row: AwardProgressRow) {
    const required =
      row.requiredBusiness === null
        ? null
        : new Prisma.Decimal(row.requiredBusiness);
    const current = new Prisma.Decimal(row.currentBusiness);
    const percent = required
      ? Prisma.Decimal.min(
          current.div(required).mul(100),
          new Prisma.Decimal(100),
        ).toDecimalPlaces(2)
      : new Prisma.Decimal(100);

    return {
      levelNumber: row.levelNumber,
      requiredBusiness: required === null ? null : this.moneyString(required),
      currentBusiness: this.moneyString(current),
      required: required !== null,
      achieved: row.achievedAt !== null,
      achievedAt: row.achievedAt,
      progressPercent: percent.toFixed(2),
    };
  }

  private eventSnapshot(row: AwardEventRow, admin: boolean) {
    return {
      id: row.id,
      sourceKey: row.sourceKey,
      userTrackId: row.userTrackId,
      userId: row.userId,
      ...(admin ? { username: row.username, email: row.email } : {}),
      policyVersionId: row.policyVersionId,
      packageDefinitionId: row.packageDefinitionId,
      packageCode: row.packageCodeSnapshot,
      packageDisplayName: row.packageDisplayNameSnapshot,
      awardAmount: this.moneyString(row.awardAmount),
      currency: row.currency,
      levelProgressSnapshot: this.jsonValue(row.levelProgressSnapshot),
      ledgerTransactionId: row.ledgerTransactionId,
      postedAt: row.postedAt,
      createdAt: row.createdAt,
    };
  }

  private candidateSnapshot(row: CandidateTrackRow) {
    return {
      sourceSubscriptionId: row.sourceSubscriptionId,
      packageDefinitionId: row.packageDefinitionId,
      packageCode: row.packageCode,
      packageDisplayName: row.packageDisplayName,
      policyTrackId: row.policyTrackId,
      trackOrder: row.trackOrder,
      awardAmount: this.moneyString(row.awardAmount),
      status: 'WAITING' as const,
    };
  }

  private jsonValue(value: Prisma.JsonValue | string) {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as Prisma.JsonValue;
    } catch {
      return value;
    }
  }

  private booleanValue(value: boolean | number) {
    return value === true || value === 1;
  }

  private moneyString(value: DecimalValue) {
    return new Prisma.Decimal(value).toFixed(8);
  }

  private countNumber(value: bigint | number | string | undefined) {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    return Number(value ?? 0);
  }

  private parseDate(value: string, label: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} must be a valid ISO date-time.`);
    }
    return date;
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
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
      }
    }
    throw lastError;
  }
}
