import { randomInt } from 'node:crypto';
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
  normalizeDepositTransactionId,
} from './deposit.validation';
import type {
  AdminDepositQueryDto,
  CreateDepositAccountDto,
  CreateDepositDto,
  ReviewDepositDto,
  SubmitDepositTxidDto,
  UpdateDepositAccountDto,
} from './dto/deposit.dto';
import {
  DEPOSIT_AUDIT_OPERATIONS,
  type DepositNetwork,
  type DepositStatus,
} from './deposits.constants';

const DEPOSIT_ACCOUNT_SELECT = {
  id: true,
  label: true,
  asset: true,
  network: true,
  walletAddress: true,
  qrCodeDataUrl: true,
  isActive: true,
  revision: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DEPOSIT_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      username: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class DepositsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDepositAccounts() {
    const accounts = await this.prisma.depositAccount.findMany({
      select: DEPOSIT_ACCOUNT_SELECT,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return { accounts };
  }

  async createDepositAccount(
    dto: CreateDepositAccountDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const account = await transaction.depositAccount.create({
        data: {
          label: dto.label,
          asset: dto.asset,
          network: dto.network,
          walletAddress: dto.walletAddress,
          qrCodeDataUrl: dto.qrCodeDataUrl,
          isActive: dto.isActive ?? true,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
        },
        select: DEPOSIT_ACCOUNT_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'DepositAccount',
          entityId: account.id,
          description: `Administrator created a ${account.asset} ${account.network} receiving account.`,
          metadata: {
            source: 'ADMIN_DEPOSIT_ACCOUNT',
            operation: DEPOSIT_AUDIT_OPERATIONS.CREATE_ACCOUNT,
            reason: dto.reason,
            after: this.accountAuditSnapshot(account),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'Deposit account created.',
        account,
      };
    });
  }

  async updateDepositAccount(
    accountId: string,
    dto: UpdateDepositAccountDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const suppliedFields = Object.entries(dto)
      .filter(
        ([key, value]) =>
          key !== 'expectedRevision' && key !== 'reason' && value !== undefined,
      )
      .map(([key]) => key);

    if (suppliedFields.length === 0) {
      throw new BadRequestException(
        'At least one deposit-account setting must be supplied.',
      );
    }

    return this.runSerializable(async (transaction) => {
      const before = await transaction.depositAccount.findUnique({
        where: { id: accountId },
        select: DEPOSIT_ACCOUNT_SELECT,
      });

      if (!before) {
        throw new NotFoundException('Deposit account was not found.');
      }

      if (before.revision !== dto.expectedRevision) {
        throw new ConflictException(
          `Deposit account revision is stale. Current revision is ${before.revision}.`,
        );
      }

      const updated = await transaction.depositAccount.updateMany({
        where: {
          id: accountId,
          revision: dto.expectedRevision,
        },
        data: {
          label: dto.label,
          qrCodeDataUrl: dto.qrCodeDataUrl,
          isActive: dto.isActive,
          revision: { increment: 1 },
          updatedByUserId: actor.id,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Deposit account changed concurrently; reload and retry.',
        );
      }

      const after = await transaction.depositAccount.findUniqueOrThrow({
        where: { id: accountId },
        select: DEPOSIT_ACCOUNT_SELECT,
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'DepositAccount',
          entityId: accountId,
          description: `Administrator updated a ${after.asset} ${after.network} receiving account.`,
          metadata: {
            source: 'ADMIN_DEPOSIT_ACCOUNT',
            operation: DEPOSIT_AUDIT_OPERATIONS.UPDATE_ACCOUNT,
            reason: dto.reason,
            changedFields: suppliedFields,
            before: this.accountAuditSnapshot(before),
            after: this.accountAuditSnapshot(after),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'Deposit account updated.',
        account: after,
      };
    });
  }

  async getMyDeposits(actor: AuthenticatedUser) {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId: actor.id },
      include: DEPOSIT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      deposits: deposits.map((deposit) => this.depositSnapshot(deposit)),
    };
  }

  async createDeposit(
    dto: CreateDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const existingOpen = await transaction.deposit.findUnique({
        where: { openKey: actor.id },
        select: { id: true, status: true },
      });

      if (existingOpen) {
        throw new ConflictException(
          `An open deposit already exists with status ${existingOpen.status}.`,
        );
      }

      const now = new Date();
      const plans = await transaction.packagePlanVersion.findMany({
        where: {
          status: 'PUBLISHED',
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          items: {
            some: {
              id: dto.packagePlanItemId,
              availability: 'AVAILABLE',
            },
          },
        },
        include: {
          items: {
            where: { id: dto.packagePlanItemId },
            include: { packageDefinition: true },
          },
        },
        orderBy: [{ effectiveFrom: 'desc' }, { versionNumber: 'desc' }],
        take: 2,
      });

      if (plans.length > 1) {
        throw new ServiceUnavailableException(
          'Package catalogue has overlapping effective plan versions.',
        );
      }

      const plan = plans[0];
      const item = plan?.items[0];

      if (!plan || !item) {
        throw new BadRequestException(
          'Selected package is not currently available for a new deposit.',
        );
      }

      const accounts = await transaction.depositAccount.findMany({
        where: {
          isActive: true,
          asset: item.currency,
        },
        select: DEPOSIT_ACCOUNT_SELECT,
        orderBy: { id: 'asc' },
      });

      if (accounts.length === 0) {
        throw new ServiceUnavailableException(
          `No active ${item.currency} receiving account is currently available.`,
        );
      }

      const assignedAccount = accounts[randomInt(accounts.length)];

      const deposit = await transaction.deposit.create({
        data: {
          userId: actor.id,
          openKey: actor.id,
          status: 'AWAITING_TXID',
          packagePlanVersionId: plan.id,
          packagePlanItemId: item.id,
          packageCode: item.packageDefinition.code,
          packageDisplayName: item.displayName,
          amount: item.price,
          currency: item.currency,
          assignedDepositAccountId: assignedAccount.id,
          assignedAccountLabel: assignedAccount.label,
          assignedWalletAddress: assignedAccount.walletAddress,
          assignedNetwork: assignedAccount.network,
          assignedQrCodeDataUrl: assignedAccount.qrCodeDataUrl,
        },
        include: DEPOSIT_INCLUDE,
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'Deposit',
          entityId: deposit.id,
          description: 'User created a package deposit request.',
          metadata: {
            source: 'USER_DEPOSIT',
            operation: DEPOSIT_AUDIT_OPERATIONS.CREATE_REQUEST,
            packagePlanVersionId: plan.id,
            packagePlanItemId: item.id,
            packageCode: item.packageDefinition.code,
            amount: item.price.toString(),
            currency: item.currency,
            assignedDepositAccountId: assignedAccount.id,
            assignedWalletAddress: assignedAccount.walletAddress,
            assignedNetwork: assignedAccount.network,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'Deposit request created.',
        deposit: this.depositSnapshot(deposit),
      };
    });
  }

  async submitTxid(
    depositId: string,
    dto: SubmitDepositTxidDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const deposit = await transaction.deposit.findFirst({
        where: { id: depositId, userId: actor.id },
        include: DEPOSIT_INCLUDE,
      });

      if (!deposit) {
        throw new NotFoundException('Deposit was not found.');
      }

      if (deposit.status !== 'AWAITING_TXID') {
        throw new ConflictException(
          'TXID may only be submitted for a deposit awaiting TXID.',
        );
      }

      const normalizedTxid = normalizeDepositTransactionId(
        deposit.assignedNetwork as DepositNetwork,
        dto.txid,
      );

      if (!normalizedTxid) {
        throw new BadRequestException(
          `Transaction ID is invalid for ${deposit.assignedNetwork}.`,
        );
      }

      const submittedAt = new Date();
      const updated = await transaction.deposit.updateMany({
        where: {
          id: depositId,
          userId: actor.id,
          status: 'AWAITING_TXID',
          txid: null,
        },
        data: {
          txid: normalizedTxid,
          submittedAt,
          status: 'PENDING_REVIEW',
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Deposit changed concurrently; reload and retry.',
        );
      }

      const after = await transaction.deposit.findUniqueOrThrow({
        where: { id: depositId },
        include: DEPOSIT_INCLUDE,
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'Deposit',
          entityId: depositId,
          description: 'User submitted a deposit transaction ID for review.',
          metadata: {
            source: 'USER_DEPOSIT',
            operation: DEPOSIT_AUDIT_OPERATIONS.SUBMIT_TXID,
            txid: normalizedTxid,
            network: deposit.assignedNetwork,
            submittedAt: submittedAt.toISOString(),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'TXID submitted for manual review.',
        deposit: this.depositSnapshot(after),
      };
    });
  }

  async listDeposits(query: AdminDepositQueryDto) {
    const where = {
      status: query.status,
      userId: query.userId,
    };
    const skip = (query.page - 1) * query.limit;

    const [total, deposits] = await Promise.all([
      this.prisma.deposit.count({ where }),
      this.prisma.deposit.findMany({
        where,
        include: DEPOSIT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      deposits: deposits.map((deposit) => this.depositSnapshot(deposit)),
    };
  }

  async getDeposit(depositId: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
      include: DEPOSIT_INCLUDE,
    });

    if (!deposit) {
      throw new NotFoundException('Deposit was not found.');
    }

    return { deposit: this.depositSnapshot(deposit) };
  }

  approveDeposit(
    depositId: string,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.reviewDeposit(depositId, 'APPROVED', dto, actor, context);
  }

  rejectDeposit(
    depositId: string,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.reviewDeposit(depositId, 'REJECTED', dto, actor, context);
  }

  private async reviewDeposit(
    depositId: string,
    targetStatus: Extract<DepositStatus, 'APPROVED' | 'REJECTED'>,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    return this.runSerializable(async (transaction) => {
      const before = await transaction.deposit.findUnique({
        where: { id: depositId },
        include: DEPOSIT_INCLUDE,
      });

      if (!before) {
        throw new NotFoundException('Deposit was not found.');
      }

      if (before.status !== 'PENDING_REVIEW') {
        throw new ConflictException(
          'Only a deposit pending review may be approved or rejected.',
        );
      }

      const reviewedAt = new Date();
      const updated = await transaction.deposit.updateMany({
        where: {
          id: depositId,
          status: 'PENDING_REVIEW',
          openKey: before.userId,
        },
        data: {
          status: targetStatus,
          openKey: null,
          reviewedByUserId: actor.id,
          reviewedAt,
          reviewNote: dto.note,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Deposit changed concurrently; reload and retry.',
        );
      }

      const after = await transaction.deposit.findUniqueOrThrow({
        where: { id: depositId },
        include: DEPOSIT_INCLUDE,
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: targetStatus === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entityType: 'Deposit',
          entityId: depositId,
          description:
            targetStatus === 'APPROVED'
              ? 'Administrator approved a manually reviewed deposit.'
              : 'Administrator rejected a manually reviewed deposit.',
          metadata: {
            source: 'ADMIN_DEPOSIT_REVIEW',
            operation:
              targetStatus === 'APPROVED'
                ? DEPOSIT_AUDIT_OPERATIONS.APPROVE
                : DEPOSIT_AUDIT_OPERATIONS.REJECT,
            note: dto.note,
            txid: before.txid,
            amount: before.amount.toString(),
            currency: before.currency,
            assignedDepositAccountId: before.assignedDepositAccountId,
            assignedWalletAddress: before.assignedWalletAddress,
            assignedNetwork: before.assignedNetwork,
            reviewedAt: reviewedAt.toISOString(),
            downstreamAccountingApplied: false,
            packageActivationApplied: false,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message:
          targetStatus === 'APPROVED'
            ? 'Deposit approved. Accounting credit is deferred.'
            : 'Deposit rejected.',
        deposit: this.depositSnapshot(after),
      };
    });
  }

  private depositSnapshot(deposit: {
    id: string;
    userId: string;
    status: DepositStatus;
    packagePlanVersionId: string;
    packagePlanItemId: string;
    packageCode: string;
    packageDisplayName: string;
    amount: Prisma.Decimal;
    currency: string;
    assignedDepositAccountId: string;
    assignedAccountLabel: string;
    assignedWalletAddress: string;
    assignedNetwork: string;
    assignedQrCodeDataUrl: string;
    txid: string | null;
    submittedAt: Date | null;
    reviewedByUserId: string | null;
    reviewedAt: Date | null;
    reviewNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    };
    reviewedBy: {
      id: string;
      username: string;
      email: string | null;
    } | null;
  }) {
    return {
      id: deposit.id,
      userId: deposit.userId,
      status: deposit.status,
      packagePlanVersionId: deposit.packagePlanVersionId,
      packagePlanItemId: deposit.packagePlanItemId,
      packageCode: deposit.packageCode,
      packageDisplayName: deposit.packageDisplayName,
      amount: this.decimalString(deposit.amount),
      currency: deposit.currency,
      assignedDepositAccountId: deposit.assignedDepositAccountId,
      assignedAccountLabel: deposit.assignedAccountLabel,
      assignedWalletAddress: deposit.assignedWalletAddress,
      assignedNetwork: deposit.assignedNetwork,
      assignedQrCodeDataUrl: deposit.assignedQrCodeDataUrl,
      txid: deposit.txid,
      submittedAt: deposit.submittedAt,
      reviewedByUserId: deposit.reviewedByUserId,
      reviewedAt: deposit.reviewedAt,
      reviewNote: deposit.reviewNote,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
      user: deposit.user,
      reviewedBy: deposit.reviewedBy,
    };
  }

  private decimalString(value: Prisma.Decimal): string {
    return value.toFixed(8).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '');
  }

  private accountAuditSnapshot(account: {
    id: string;
    label: string;
    asset: string;
    network: string;
    walletAddress: string;
    isActive: boolean;
    revision: number;
  }) {
    return {
      id: account.id,
      label: account.label,
      asset: account.asset,
      network: account.network,
      walletAddress: account.walletAddress,
      isActive: account.isActive,
      revision: account.revision,
      qrConfigured: true,
    };
  }

  private async runSerializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const targetMeta = error.meta?.target;
        const target = Array.isArray(targetMeta)
          ? targetMeta
              .filter((value): value is string => typeof value === 'string')
              .join(',')
          : typeof targetMeta === 'string'
            ? targetMeta
            : '';

        if (target.includes('txid')) {
          throw new ConflictException(
            'This transaction ID has already been submitted on this network.',
          );
        }

        if (target.includes('openKey')) {
          throw new ConflictException(
            'An open deposit already exists for this user.',
          );
        }

        if (target.includes('walletAddress')) {
          throw new ConflictException(
            'This asset/network receiving wallet already exists.',
          );
        }

        throw new ConflictException(
          'Deposit data conflicts with an existing unique value.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Deposit state changed concurrently; reload and retry.',
        );
      }

      throw error;
    }
  }
}
