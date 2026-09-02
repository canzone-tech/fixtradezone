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
  AdminPayoutQueryDto,
  CreatePayoutDto,
  PayoutPageQueryDto,
  PayoutReviewDto,
  SubmitPayoutTxidDto,
} from './dto/payout.dto';
import { PayoutAccountingService } from './payout-accounting.service';
import { PayoutPolicyService } from './payout-policy.service';
import {
  PAYOUT_AUDIT_OPERATIONS,
  type PayoutBucket,
  type PayoutStatus,
} from './payouts.constants';
import {
  isValidPayoutAddress,
  normalizePayoutTransactionId,
} from './payouts.validation';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
type DecimalValue = Prisma.Decimal | number | string;

interface CountRow {
  total: bigint | number | string;
}

interface PayoutRow {
  id: string;
  userId: string;
  requestKey: string;
  policyVersionId: string;
  sourceBucket: PayoutBucket;
  asset: string;
  networkCode: string;
  validationProfile: string;
  grossAmount: DecimalValue;
  feeAmount: DecimalValue;
  netAmount: DecimalValue;
  destinationAddress: string;
  status: PayoutStatus;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  externalTxid: string | null;
  submittedByUserId: string | null;
  submittedAt: Date | null;
  completedByUserId: string | null;
  completedAt: Date | null;
  reserveLedgerTransactionId: string | null;
  releaseLedgerTransactionId: string | null;
  settlementLedgerTransactionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminPayoutRow extends PayoutRow {
  username: string;
  email: string | null;
}

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutPolicy: PayoutPolicyService,
    private readonly payoutAccounting: PayoutAccountingService,
  ) {}

  async getMyPayouts(userId: string, query: PayoutPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<PayoutRow[]>(Prisma.sql`
      SELECT *
      FROM payout_requests
      WHERE userId = ${userId}
      ORDER BY createdAt DESC, id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const counts = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM payout_requests
      WHERE userId = ${userId}
    `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      payouts: rows.map((row) => this.payoutSnapshot(row)),
    };
  }

  async createRequest(
    dto: CreatePayoutDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const existingRows = await transaction.$queryRaw<PayoutRow[]>(Prisma.sql`
        SELECT *
        FROM payout_requests
        WHERE userId = ${actor.id}
          AND requestKey = ${dto.requestKey}
        LIMIT 1
        FOR UPDATE
      `);
      const existing = existingRows[0];
      const requestedAddress = dto.destinationAddress.trim();
      const requestedAmount = new Prisma.Decimal(dto.amount).toFixed(8);

      if (existing) {
        const sameRequest =
          existing.sourceBucket === dto.sourceBucket &&
          new Prisma.Decimal(existing.grossAmount).equals(requestedAmount) &&
          existing.destinationAddress === requestedAddress;

        if (!sameRequest) {
          throw new ConflictException(
            'The payout request key was already used with different request data.',
          );
        }

        return {
          created: false,
          payout: this.payoutSnapshot(existing),
        };
      }

      const policy = await this.payoutPolicy.requireEffectivePolicy(transaction);
      await this.payoutPolicy.requireEnabledBucket(
        transaction,
        policy.id,
        dto.sourceBucket,
      );

      const profile = this.payoutPolicy.validationProfile(
        policy.validationProfile,
      );

      if (!requestedAddress) {
        throw new BadRequestException(
          'Payout destination address is required.',
        );
      }
      if (!isValidPayoutAddress(profile, requestedAddress)) {
        throw new BadRequestException(
          'The payout destination address is invalid for the configured network.',
        );
      }

      const gross = new Prisma.Decimal(requestedAmount);
      if (gross.lte(0)) {
        throw new BadRequestException(
          'Payout amount must be greater than zero.',
        );
      }
      if (
        policy.minimumAmount !== null &&
        gross.lt(new Prisma.Decimal(policy.minimumAmount))
      ) {
        throw new ConflictException(
          'Payout amount is below the configured minimum.',
        );
      }
      if (
        policy.maximumAmount !== null &&
        gross.gt(new Prisma.Decimal(policy.maximumAmount))
      ) {
        throw new ConflictException(
          'Payout amount exceeds the configured maximum.',
        );
      }

      const rawFee = new Prisma.Decimal(policy.fixedFeeAmount).plus(
        gross.mul(new Prisma.Decimal(policy.percentageFee)).div(100),
      );
      const fee = new Prisma.Decimal(rawFee.toFixed(8));
      const net = gross.minus(fee);

      if (net.lte(0)) {
        throw new ConflictException(
          'Configured payout fees leave no payable amount.',
        );
      }

      const payoutId = randomUUID();
      const currency = policy.asset.trim().toUpperCase();
      const networkCode = policy.networkCode.trim().toUpperCase();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO payout_requests (
          id, userId, requestKey, policyVersionId, sourceBucket,
          asset, networkCode, validationProfile,
          grossAmount, feeAmount, netAmount, destinationAddress,
          status, createdAt, updatedAt
        ) VALUES (
          ${payoutId}, ${actor.id}, ${dto.requestKey}, ${policy.id},
          ${dto.sourceBucket}, ${currency}, ${networkCode}, ${profile},
          ${gross.toFixed(8)}, ${fee.toFixed(8)}, ${net.toFixed(8)},
          ${requestedAddress}, 'PENDING_REVIEW',
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      const reserveLedgerTransactionId =
        await this.payoutAccounting.reserveInTransaction(
          transaction,
          {
            payoutId,
            userId: actor.id,
            sourceBucket: dto.sourceBucket,
            currency,
            grossAmount: gross.toFixed(8),
            feeAmount: fee.toFixed(8),
            netAmount: net.toFixed(8),
          },
          actor,
          context,
        );

      const linked = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_requests
        SET
          reserveLedgerTransactionId = ${reserveLedgerTransactionId},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${payoutId}
          AND reserveLedgerTransactionId IS NULL
      `);

      if (linked !== 1) {
        throw new ServiceUnavailableException(
          'Payout reserve could not be linked to its request.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'PayoutRequest',
          entityId: payoutId,
          description: 'USER payout request created and funds reserved.',
          metadata: {
            source: 'PAYOUT',
            operation: PAYOUT_AUDIT_OPERATIONS.CREATE_REQUEST,
            payoutId,
            policyVersionId: policy.id,
            sourceBucket: dto.sourceBucket,
            grossAmount: gross.toFixed(8),
            feeAmount: fee.toFixed(8),
            netAmount: net.toFixed(8),
            asset: currency,
            networkCode,
            reserveLedgerTransactionId,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        created: true,
        payout: this.payoutSnapshot(
          await this.requirePayout(transaction, payoutId, true),
        ),
      };
    });
  }

  async listAdminPayouts(query: AdminPayoutQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND pr.userId = ${query.userId}`
      : Prisma.empty;
    const statusFilter = query.status
      ? Prisma.sql`AND pr.status = ${query.status}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<AdminPayoutRow[]>(Prisma.sql`
      SELECT pr.*, u.username, u.email
      FROM payout_requests pr
      INNER JOIN users u ON u.id = pr.userId
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
      ORDER BY pr.createdAt DESC, pr.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const counts = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM payout_requests pr
      WHERE 1 = 1
        ${userFilter}
        ${statusFilter}
    `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      payouts: rows.map((row) => ({
        ...this.payoutSnapshot(row),
        username: row.username,
        email: row.email,
      })),
    };
  }

  async getAdminPayout(payoutId: string) {
    const rows = await this.prisma.$queryRaw<AdminPayoutRow[]>(Prisma.sql`
      SELECT pr.*, u.username, u.email
      FROM payout_requests pr
      INNER JOIN users u ON u.id = pr.userId
      WHERE pr.id = ${payoutId}
      LIMIT 1
    `);
    const payout = rows[0];

    if (!payout) {
      throw new NotFoundException('Payout request was not found.');
    }

    return {
      ...this.payoutSnapshot(payout),
      username: payout.username,
      email: payout.email,
    };
  }

  async approve(
    payoutId: string,
    dto: PayoutReviewDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const payout = await this.requirePayout(transaction, payoutId, true);

      if (payout.status !== 'PENDING_REVIEW') {
        throw new ConflictException(
          'Only a pending payout may be approved.',
        );
      }
      if (!payout.reserveLedgerTransactionId) {
        throw new ServiceUnavailableException(
          'Payout reserve accounting is missing.',
        );
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_requests
        SET
          status = 'APPROVED',
          reviewedByUserId = ${actor.id},
          reviewedAt = CURRENT_TIMESTAMP(3),
          reviewNote = ${dto.note?.trim() || null},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${payoutId}
          AND status = 'PENDING_REVIEW'
      `);

      if (updated !== 1) {
        throw new ConflictException('Payout changed concurrently.');
      }

      await this.auditLifecycle(
        transaction,
        actor,
        context,
        payoutId,
        'APPROVE',
        'Payout request approved.',
        PAYOUT_AUDIT_OPERATIONS.APPROVE,
        { note: dto.note ?? null },
      );

      return this.payoutSnapshot(
        await this.requirePayout(transaction, payoutId, false),
      );
    });
  }

  async reject(
    payoutId: string,
    dto: PayoutReviewDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const payout = await this.requirePayout(transaction, payoutId, true);

      if (
        payout.status !== 'PENDING_REVIEW' &&
        payout.status !== 'APPROVED'
      ) {
        throw new ConflictException(
          'Only a pending or approved payout may be rejected.',
        );
      }
      if (!payout.reserveLedgerTransactionId) {
        throw new ServiceUnavailableException(
          'Payout reserve accounting is missing.',
        );
      }

      const releaseLedgerTransactionId =
        await this.payoutAccounting.releaseInTransaction(
          transaction,
          this.accountingInput(payout),
          actor,
          context,
        );

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_requests
        SET
          status = 'REJECTED',
          reviewedByUserId = ${actor.id},
          reviewedAt = CURRENT_TIMESTAMP(3),
          reviewNote = ${dto.note?.trim() || null},
          releaseLedgerTransactionId = ${releaseLedgerTransactionId},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${payoutId}
          AND status IN ('PENDING_REVIEW', 'APPROVED')
          AND releaseLedgerTransactionId IS NULL
      `);

      if (updated !== 1) {
        throw new ConflictException('Payout changed concurrently.');
      }

      await this.auditLifecycle(
        transaction,
        actor,
        context,
        payoutId,
        'REJECT',
        'Payout request rejected and reserved funds released.',
        PAYOUT_AUDIT_OPERATIONS.REJECT,
        { note: dto.note ?? null, releaseLedgerTransactionId },
      );

      return this.payoutSnapshot(
        await this.requirePayout(transaction, payoutId, false),
      );
    });
  }

  async submitExternalTxid(
    payoutId: string,
    dto: SubmitPayoutTxidDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const payout = await this.requirePayout(transaction, payoutId, true);

      if (payout.status !== 'APPROVED') {
        throw new ConflictException(
          'Only an approved payout may be submitted to the network.',
        );
      }

      const profile = this.payoutPolicy.validationProfile(
        payout.validationProfile,
      );
      const normalizedTxid = normalizePayoutTransactionId(profile, dto.txid);

      if (!normalizedTxid) {
        throw new BadRequestException(
          'External transaction ID is invalid for the payout network.',
        );
      }

      const duplicates = await transaction.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id
          FROM payout_requests
          WHERE networkCode = ${payout.networkCode}
            AND externalTxid = ${normalizedTxid}
            AND id <> ${payout.id}
          LIMIT 1
          FOR UPDATE
        `,
      );

      if (duplicates.length > 0) {
        throw new ConflictException(
          'External transaction ID is already assigned to another payout.',
        );
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_requests
        SET
          status = 'SUBMITTED',
          externalTxid = ${normalizedTxid},
          submittedByUserId = ${actor.id},
          submittedAt = CURRENT_TIMESTAMP(3),
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${payoutId}
          AND status = 'APPROVED'
          AND externalTxid IS NULL
      `);

      if (updated !== 1) {
        throw new ConflictException('Payout changed concurrently.');
      }

      await this.auditLifecycle(
        transaction,
        actor,
        context,
        payoutId,
        'UPDATE',
        'External payout transaction ID recorded for manual settlement tracking.',
        PAYOUT_AUDIT_OPERATIONS.SUBMIT_TXID,
        {
          networkCode: payout.networkCode,
          externalTxid: normalizedTxid,
          blockchainTransferVerifiedByPlatform: false,
        },
      );

      return this.payoutSnapshot(
        await this.requirePayout(transaction, payoutId, false),
      );
    });
  }

  async complete(
    payoutId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const payout = await this.requirePayout(transaction, payoutId, true);

      if (payout.status !== 'SUBMITTED') {
        throw new ConflictException(
          'Only a submitted payout may be completed.',
        );
      }
      if (!payout.externalTxid) {
        throw new ServiceUnavailableException(
          'Submitted payout is missing its external transaction ID.',
        );
      }

      const settlementLedgerTransactionId =
        await this.payoutAccounting.settleInTransaction(
          transaction,
          this.accountingInput(payout),
          actor,
          context,
        );

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE payout_requests
        SET
          status = 'COMPLETED',
          completedByUserId = ${actor.id},
          completedAt = CURRENT_TIMESTAMP(3),
          settlementLedgerTransactionId = ${settlementLedgerTransactionId},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${payoutId}
          AND status = 'SUBMITTED'
          AND settlementLedgerTransactionId IS NULL
      `);

      if (updated !== 1) {
        throw new ConflictException('Payout changed concurrently.');
      }

      await this.auditLifecycle(
        transaction,
        actor,
        context,
        payoutId,
        'UPDATE',
        'Payout marked completed and reserved funds settled.',
        PAYOUT_AUDIT_OPERATIONS.COMPLETE,
        {
          externalTxid: payout.externalTxid,
          settlementLedgerTransactionId,
          completionAuthority: 'ADMIN_MANUAL_CONFIRMATION',
        },
      );

      return this.payoutSnapshot(
        await this.requirePayout(transaction, payoutId, false),
      );
    });
  }

  private async requirePayout(
    client: Prisma.TransactionClient | PrismaService,
    payoutId: string,
    forUpdate: boolean,
  ): Promise<PayoutRow> {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await client.$queryRaw<PayoutRow[]>(Prisma.sql`
      SELECT *
      FROM payout_requests
      WHERE id = ${payoutId}
      LIMIT 1
      ${lock}
    `);

    if (!rows[0]) {
      throw new NotFoundException('Payout request was not found.');
    }
    return rows[0];
  }

  private accountingInput(payout: PayoutRow) {
    return {
      payoutId: payout.id,
      userId: payout.userId,
      sourceBucket: payout.sourceBucket,
      currency: payout.asset,
      grossAmount: new Prisma.Decimal(payout.grossAmount).toFixed(8),
      feeAmount: new Prisma.Decimal(payout.feeAmount).toFixed(8),
      netAmount: new Prisma.Decimal(payout.netAmount).toFixed(8),
    };
  }

  private payoutSnapshot(row: PayoutRow) {
    return {
      id: row.id,
      userId: row.userId,
      requestKey: row.requestKey,
      policyVersionId: row.policyVersionId,
      sourceBucket: row.sourceBucket,
      asset: row.asset,
      networkCode: row.networkCode,
      validationProfile: row.validationProfile,
      grossAmount: this.decimalString(row.grossAmount),
      feeAmount: this.decimalString(row.feeAmount),
      netAmount: this.decimalString(row.netAmount),
      destinationAddress: row.destinationAddress,
      status: row.status,
      reviewedByUserId: row.reviewedByUserId,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      externalTxid: row.externalTxid,
      submittedByUserId: row.submittedByUserId,
      submittedAt: row.submittedAt,
      completedByUserId: row.completedByUserId,
      completedAt: row.completedAt,
      reserveLedgerTransactionId: row.reserveLedgerTransactionId,
      releaseLedgerTransactionId: row.releaseLedgerTransactionId,
      settlementLedgerTransactionId: row.settlementLedgerTransactionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async auditLifecycle(
    transaction: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    context: RequestContext,
    payoutId: string,
    action: 'APPROVE' | 'REJECT' | 'UPDATE',
    description: string,
    operation: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorUserId: actor.id,
        action,
        entityType: 'PayoutRequest',
        entityId: payoutId,
        description,
        metadata: {
          source: 'PAYOUT',
          operation,
          payoutId,
          ...metadata,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }

  private decimalString(value: DecimalValue): string {
    const decimal =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    return decimal.toFixed(8).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '');
  }

  private countNumber(
    value: bigint | number | string | undefined,
  ): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
    return 0;
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
