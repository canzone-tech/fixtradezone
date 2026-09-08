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
import type {
  PayoutPageQueryDto,
  PublishPayoutPolicyDto,
  UpdatePayoutPolicyDraftDto,
} from './dto/payout.dto';
import {
  PAYOUT_AUDIT_OPERATIONS,
  PAYOUT_BUCKETS,
  PAYOUT_VALIDATION_PROFILES,
  type PayoutBucket,
  type PayoutValidationProfile,
} from './payouts.constants';

type DecimalValue = Prisma.Decimal | number | string;

interface PayoutPolicyRow {
  id: string;
  versionNumber: number;
  status: 'DRAFT' | 'PUBLISHED';
  revision: number;
  requestsEnabled: boolean | number;
  asset: string;
  networkCode: string;
  validationProfile: string;
  minimumAmount: DecimalValue | null;
  maximumAmount: DecimalValue | null;
  fixedFeeAmount: DecimalValue;
  percentageFee: DecimalValue;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  publishedAt: Date | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface BucketRuleRow {
  policyVersionId: string;
  bucket: PayoutBucket;
  enabled: boolean | number;
}

interface CountRow {
  total: bigint | number | string;
}

interface VersionRow {
  versionNumber: bigint | number | string;
}

interface NormalizedPolicyConfig {
  requestsEnabled: boolean;
  asset: string;
  networkCode: string;
  validationProfile: PayoutValidationProfile;
  minimumAmount: string | null;
  maximumAmount: string | null;
  fixedFeeAmount: string;
  percentageFee: string;
}

@Injectable()
export class PayoutPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentPolicy() {
    const policy = await this.getEffectivePolicy(this.prisma);

    if (!policy) {
      return {
        available: false,
        requestsEnabled: false,
        policy: null,
        enabledBuckets: [],
      };
    }

    const rules = await this.getBucketRules(this.prisma, policy.id, false);

    return {
      available: true,
      requestsEnabled: Boolean(policy.requestsEnabled),
      policy: this.policySnapshot(policy),
      enabledBuckets: this.enabledBuckets(rules),
    };
  }

  async listPolicies(query: PayoutPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const policies = await this.prisma.$queryRaw<PayoutPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM payout_policy_versions
      ORDER BY versionNumber DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const counts = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM payout_policy_versions
    `);

    const policyIds = policies.map((policy) => policy.id);
    const rules =
      policyIds.length === 0
        ? []
        : await this.prisma.$queryRaw<BucketRuleRow[]>(Prisma.sql`
            SELECT policyVersionId, bucket, enabled
            FROM payout_policy_bucket_rules
            WHERE policyVersionId IN (${Prisma.join(policyIds)})
          `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      policies: policies.map((policy) => ({
        ...this.policySnapshot(policy),
        enabledBuckets: this.enabledBuckets(
          rules.filter((rule) => rule.policyVersionId === policy.id),
        ),
      })),
    };
  }

  async createDraft(actor: AuthenticatedUser, context: RequestContext = {}) {
    return this.runSerializable(async (transaction) => {
      const existingDrafts = await transaction.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id
          FROM payout_policy_versions
          WHERE status = 'DRAFT'
          LIMIT 1
          FOR UPDATE
        `,
      );

      if (existingDrafts.length > 0) {
        throw new ConflictException(
          'A payout policy draft already exists. Update or publish it first.',
        );
      }

      const versionRows = await transaction.$queryRaw<VersionRow[]>(Prisma.sql`
        SELECT COALESCE(MAX(versionNumber), 0) AS versionNumber
        FROM payout_policy_versions
      `);
      const versionNumber = this.countNumber(versionRows[0]?.versionNumber) + 1;
      const id = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO payout_policy_versions (
          id, versionNumber, status, revision, requestsEnabled,
          asset, networkCode, validationProfile,
          minimumAmount, maximumAmount, fixedFeeAmount, percentageFee,
          createdByUserId, updatedByUserId, createdAt, updatedAt
        ) VALUES (
          ${id}, ${versionNumber}, 'DRAFT', 1, FALSE,
          'USDT', 'TRC20', 'TRON',
          NULL, NULL, 0.00000000, 0.000000,
          ${actor.id}, ${actor.id}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      for (const bucket of PAYOUT_BUCKETS) {
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO payout_policy_bucket_rules (
            id, policyVersionId, bucket, enabled, createdAt, updatedAt
          ) VALUES (
            ${randomUUID()}, ${id}, ${bucket}, FALSE,
            CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
          )
        `);
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'PayoutPolicyVersion',
          entityId: id,
          description: 'Fail-closed payout policy draft created.',
          metadata: {
            source: 'PAYOUT_POLICY',
            operation: PAYOUT_AUDIT_OPERATIONS.CREATE_DRAFT,
            versionNumber,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.getPolicy(transaction, id, false);
    });
  }

  async updateDraft(
    policyVersionId: string,
    dto: UpdatePayoutPolicyDraftDto,
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
        throw new ConflictException('Published payout policies are immutable.');
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Payout policy draft changed. Reload before saving.',
        );
      }

      const config = this.mergePolicyConfig(current, dto);
      this.validatePolicyConfig(config);

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_policy_versions
        SET
          requestsEnabled = ${config.requestsEnabled},
          asset = ${config.asset},
          networkCode = ${config.networkCode},
          validationProfile = ${config.validationProfile},
          minimumAmount = ${config.minimumAmount},
          maximumAmount = ${config.maximumAmount},
          fixedFeeAmount = ${config.fixedFeeAmount},
          percentageFee = ${config.percentageFee},
          updatedByUserId = ${actor.id},
          revision = revision + 1,
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${dto.expectedRevision}
      `);

      if (updated !== 1) {
        throw new ConflictException(
          'Payout policy draft changed. Reload before saving.',
        );
      }

      if (dto.enabledBuckets !== undefined) {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE payout_policy_bucket_rules
          SET enabled = FALSE, updatedAt = CURRENT_TIMESTAMP(3)
          WHERE policyVersionId = ${policyVersionId}
        `);

        for (const bucket of dto.enabledBuckets) {
          await transaction.$executeRaw(Prisma.sql`
            UPDATE payout_policy_bucket_rules
            SET enabled = TRUE, updatedAt = CURRENT_TIMESTAMP(3)
            WHERE policyVersionId = ${policyVersionId}
              AND bucket = ${bucket}
          `);
        }
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'PayoutPolicyVersion',
          entityId: policyVersionId,
          description: 'Payout policy draft updated.',
          metadata: {
            source: 'PAYOUT_POLICY',
            operation: PAYOUT_AUDIT_OPERATIONS.UPDATE_DRAFT,
            expectedRevision: dto.expectedRevision,
            changedFields: Object.keys(dto).filter(
              (field) => field !== 'expectedRevision',
            ),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.getPolicy(transaction, policyVersionId, false);
    });
  }

  async publish(
    policyVersionId: string,
    dto: PublishPayoutPolicyDto,
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
          'Only a payout policy draft may be published.',
        );
      }
      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Payout policy draft changed. Reload before publishing.',
        );
      }

      const config = this.normalizedPolicyConfig(current);
      this.validatePolicyConfig(config);
      const rules = await this.getBucketRules(
        transaction,
        policyVersionId,
        true,
      );
      const enabledBuckets = this.enabledBuckets(rules);

      if (config.requestsEnabled && enabledBuckets.length === 0) {
        throw new ConflictException(
          'At least one payout source bucket must be enabled before payout requests are enabled.',
        );
      }

      const openPolicies = await transaction.$queryRaw<PayoutPolicyRow[]>(
        Prisma.sql`
          SELECT *
          FROM payout_policy_versions
          WHERE status = 'PUBLISHED'
            AND effectiveTo IS NULL
          ORDER BY versionNumber DESC
          FOR UPDATE
        `,
      );

      if (openPolicies.length > 1) {
        throw new ServiceUnavailableException(
          'Multiple open payout policies exist.',
        );
      }

      const now = new Date();
      const predecessor = openPolicies[0] ?? null;

      if (predecessor) {
        const predecessorUpdated = await transaction.$executeRaw(Prisma.sql`
          UPDATE payout_policy_versions
          SET
            effectiveTo = ${now},
            updatedByUserId = ${actor.id},
            revision = revision + 1,
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${predecessor.id}
            AND effectiveTo IS NULL
        `);

        if (predecessorUpdated !== 1) {
          throw new ConflictException('Current payout policy changed.');
        }
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_policy_versions
        SET
          status = 'PUBLISHED',
          effectiveFrom = ${now},
          effectiveTo = NULL,
          publishedAt = ${now},
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
          'Payout policy draft changed. Reload before publishing.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'APPROVE',
          entityType: 'PayoutPolicyVersion',
          entityId: policyVersionId,
          description: 'Payout policy published as the effective version.',
          metadata: {
            source: 'PAYOUT_POLICY',
            operation: PAYOUT_AUDIT_OPERATIONS.PUBLISH_POLICY,
            versionNumber: current.versionNumber,
            requestsEnabled: config.requestsEnabled,
            enabledBuckets,
            predecessorPolicyVersionId: predecessor?.id ?? null,
            reason: dto.reason ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.getPolicy(transaction, policyVersionId, false);
    });
  }

  async requireEffectivePolicy(
    transaction: Prisma.TransactionClient,
  ): Promise<PayoutPolicyRow> {
    const policy = await this.getEffectivePolicy(transaction);
    if (!policy || !policy.requestsEnabled) {
      throw new ConflictException('Payout requests are currently disabled.');
    }
    return policy;
  }

  async requireEnabledBucket(
    transaction: Prisma.TransactionClient,
    policyVersionId: string,
    bucket: PayoutBucket,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<BucketRuleRow[]>(Prisma.sql`
      SELECT policyVersionId, bucket, enabled
      FROM payout_policy_bucket_rules
      WHERE policyVersionId = ${policyVersionId}
        AND bucket = ${bucket}
      LIMIT 1
    `);

    if (!rows[0] || !rows[0].enabled) {
      throw new ConflictException(
        'The selected wallet bucket is not enabled for payouts.',
      );
    }
  }

  validationProfile(value: string): PayoutValidationProfile {
    if (PAYOUT_VALIDATION_PROFILES.includes(value as PayoutValidationProfile)) {
      return value as PayoutValidationProfile;
    }
    throw new ServiceUnavailableException(
      'Payout validation profile is unsupported.',
    );
  }

  private async getEffectivePolicy(
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<PayoutPolicyRow | null> {
    const rows = await client.$queryRaw<PayoutPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM payout_policy_versions
      WHERE status = 'PUBLISHED'
        AND (effectiveFrom IS NULL OR effectiveFrom <= CURRENT_TIMESTAMP(3))
        AND (effectiveTo IS NULL OR effectiveTo > CURRENT_TIMESTAMP(3))
      ORDER BY versionNumber DESC
      LIMIT 2
    `);

    if (rows.length > 1) {
      throw new ServiceUnavailableException(
        'Payout policy configuration is ambiguous.',
      );
    }

    return rows[0] ?? null;
  }

  private async getPolicy(
    client: Prisma.TransactionClient | PrismaService,
    policyVersionId: string,
    forUpdate: boolean,
  ) {
    const policy = await this.requirePolicy(client, policyVersionId, forUpdate);
    const rules = await this.getBucketRules(client, policyVersionId, forUpdate);
    return {
      ...this.policySnapshot(policy),
      enabledBuckets: this.enabledBuckets(rules),
    };
  }

  private async requirePolicy(
    client: Prisma.TransactionClient | PrismaService,
    policyVersionId: string,
    forUpdate: boolean,
  ): Promise<PayoutPolicyRow> {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await client.$queryRaw<PayoutPolicyRow[]>(Prisma.sql`
      SELECT *
      FROM payout_policy_versions
      WHERE id = ${policyVersionId}
      LIMIT 1
      ${lock}
    `);

    if (!rows[0]) {
      throw new NotFoundException('Payout policy version was not found.');
    }
    return rows[0];
  }

  private async getBucketRules(
    client: Prisma.TransactionClient | PrismaService,
    policyVersionId: string,
    forUpdate: boolean,
  ): Promise<BucketRuleRow[]> {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    return client.$queryRaw<BucketRuleRow[]>(Prisma.sql`
      SELECT policyVersionId, bucket, enabled
      FROM payout_policy_bucket_rules
      WHERE policyVersionId = ${policyVersionId}
      ORDER BY FIELD(
        bucket,
        'MAIN',
        'PACKAGE_EARNINGS',
        'REFERRAL_COMMISSION',
        'REWARDS'
      )
      ${lock}
    `);
  }

  private mergePolicyConfig(
    current: PayoutPolicyRow,
    dto: UpdatePayoutPolicyDraftDto,
  ): NormalizedPolicyConfig {
    const base = this.normalizedPolicyConfig(current);
    return {
      requestsEnabled: dto.requestsEnabled ?? base.requestsEnabled,
      asset:
        dto.asset === undefined ? base.asset : dto.asset.trim().toUpperCase(),
      networkCode:
        dto.networkCode === undefined
          ? base.networkCode
          : dto.networkCode.trim().toUpperCase(),
      validationProfile: dto.validationProfile ?? base.validationProfile,
      minimumAmount:
        dto.minimumAmount === undefined
          ? base.minimumAmount
          : dto.minimumAmount,
      maximumAmount:
        dto.maximumAmount === undefined
          ? base.maximumAmount
          : dto.maximumAmount,
      fixedFeeAmount: dto.fixedFeeAmount ?? base.fixedFeeAmount,
      percentageFee: dto.percentageFee ?? base.percentageFee,
    };
  }

  private normalizedPolicyConfig(row: PayoutPolicyRow): NormalizedPolicyConfig {
    return {
      requestsEnabled: Boolean(row.requestsEnabled),
      asset: row.asset.trim().toUpperCase(),
      networkCode: row.networkCode.trim().toUpperCase(),
      validationProfile: this.validationProfile(row.validationProfile),
      minimumAmount:
        row.minimumAmount === null
          ? null
          : new Prisma.Decimal(row.minimumAmount).toFixed(8),
      maximumAmount:
        row.maximumAmount === null
          ? null
          : new Prisma.Decimal(row.maximumAmount).toFixed(8),
      fixedFeeAmount: new Prisma.Decimal(row.fixedFeeAmount).toFixed(8),
      percentageFee: new Prisma.Decimal(row.percentageFee).toFixed(6),
    };
  }

  private validatePolicyConfig(config: NormalizedPolicyConfig): void {
    if (!/^[A-Z0-9._-]{2,10}$/.test(config.asset)) {
      throw new BadRequestException('Payout asset is invalid.');
    }
    if (!/^[A-Z0-9._-]{2,40}$/.test(config.networkCode)) {
      throw new BadRequestException('Payout network code is invalid.');
    }

    const fixedFee = new Prisma.Decimal(config.fixedFeeAmount);
    const percentageFee = new Prisma.Decimal(config.percentageFee);
    const minimum =
      config.minimumAmount === null
        ? null
        : new Prisma.Decimal(config.minimumAmount);
    const maximum =
      config.maximumAmount === null
        ? null
        : new Prisma.Decimal(config.maximumAmount);

    if (fixedFee.lt(0)) {
      throw new BadRequestException('Payout fixed fee cannot be negative.');
    }
    if (percentageFee.lt(0) || percentageFee.gt(100)) {
      throw new BadRequestException(
        'Payout percentage fee must be between 0 and 100.',
      );
    }
    if (minimum?.lte(0)) {
      throw new BadRequestException(
        'Payout minimum amount must be greater than zero.',
      );
    }
    if (maximum?.lte(0)) {
      throw new BadRequestException(
        'Payout maximum amount must be greater than zero.',
      );
    }
    if (minimum && maximum && maximum.lt(minimum)) {
      throw new BadRequestException(
        'Payout maximum amount cannot be below the minimum amount.',
      );
    }
  }

  private policySnapshot(row: PayoutPolicyRow) {
    const config = this.normalizedPolicyConfig(row);
    return {
      id: row.id,
      versionNumber: Number(row.versionNumber),
      status: row.status,
      revision: Number(row.revision),
      ...config,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      publishedAt: row.publishedAt,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      publishedByUserId: row.publishedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private enabledBuckets(rules: BucketRuleRow[]): PayoutBucket[] {
    return rules
      .filter((rule) => Boolean(rule.enabled))
      .map((rule) => rule.bucket);
  }

  private countNumber(value: bigint | number | string | undefined): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
    return 0;
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
