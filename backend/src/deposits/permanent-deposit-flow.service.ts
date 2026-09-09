import { randomInt, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { normalizeDepositTransactionId } from './deposit.validation';
import type {
  CreateDepositDto,
  SubmitDepositRequestDto,
} from './dto/deposit.dto';
import {
  DEPOSIT_AUDIT_OPERATIONS,
  type DepositStatus,
  type DepositValidationProfile,
} from './deposits.constants';

const PAYMENT_RAIL_SELECT = {
  id: true,
  asset: true,
  networkCode: true,
  displayName: true,
  validationProfile: true,
  isActive: true,
  revision: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DEPOSIT_ACCOUNT_SELECT = {
  id: true,
  label: true,
  paymentRailId: true,
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
  readyForApprovalBy: {
    select: {
      id: true,
      username: true,
      email: true,
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

interface AddressAssignmentRow {
  id: string;
  userId: string;
  paymentRailId: string;
  depositAccountId: string;
  assignedAt: Date;
}

interface ResolvedDepositInput {
  plan: {
    id: string;
  };
  item: {
    id: string;
    displayName: string;
    price: Prisma.Decimal;
    minimumInvestment: Prisma.Decimal | null;
    maximumInvestment: Prisma.Decimal | null;
    durationDays: number | null;
    principalTreatment: string;
    currency: string;
    packageDefinition: {
      id: string;
      code: string;
    };
  };
  rangeConfigured: boolean;
  investmentAmount: Prisma.Decimal;
  rail: {
    id: string;
    asset: string;
    networkCode: string;
    displayName: string;
    validationProfile: DepositValidationProfile;
    isActive: boolean;
  };
  assignment: AddressAssignmentRow;
  account: {
    id: string;
    label: string;
    paymentRailId: string;
    asset: string;
    network: string;
    walletAddress: string;
    qrCodeDataUrl: string;
    isActive: boolean;
  };
}

@Injectable()
export class PermanentDepositFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAddressAssignment(
    paymentRailId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const rail = await transaction.depositPaymentRail.findFirst({
        where: { id: paymentRailId, isActive: true },
        select: PAYMENT_RAIL_SELECT,
      });

      if (!rail) {
        throw new BadRequestException(
          'Selected payment rail is not currently available.',
        );
      }

      const resolved = await this.resolvePermanentAssignment(
        transaction,
        actor.id,
        rail,
        context,
      );

      return {
        message: resolved.created
          ? 'Permanent receiving address assigned.'
          : 'Permanent receiving address loaded.',
        assignment: this.assignmentSnapshot(
          resolved.assignment,
          rail,
          resolved.account,
        ),
      };
    });
  }

  async createDeposit(
    dto: CreateDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const resolved = await this.resolveDepositInput(
        transaction,
        dto,
        actor,
        context,
      );

      const deposit = await this.createDepositRecord(
        transaction,
        resolved,
        actor,
        'AWAITING_TXID',
        null,
        null,
        context,
      );

      return {
        message: 'Deposit request created.',
        deposit: this.depositSnapshot(deposit),
      };
    });
  }

  async submitDeposit(
    dto: SubmitDepositRequestDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const resolved = await this.resolveDepositInput(
        transaction,
        dto,
        actor,
        context,
      );

      const normalizedTxid = normalizeDepositTransactionId(
        resolved.rail.validationProfile,
        dto.txid,
      );

      if (!normalizedTxid) {
        throw new BadRequestException(
          `Transaction ID is invalid for ${resolved.rail.networkCode}.`,
        );
      }

      const submittedAt = new Date();
      const deposit = await this.createDepositRecord(
        transaction,
        resolved,
        actor,
        'PENDING_REVIEW',
        normalizedTxid,
        submittedAt,
        context,
      );

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'Deposit',
          entityId: deposit.id,
          description: 'User submitted a deposit transaction ID for review.',
          metadata: {
            source: 'USER_DEPOSIT',
            operation: DEPOSIT_AUDIT_OPERATIONS.SUBMIT_TXID,
            txid: normalizedTxid,
            network: resolved.rail.networkCode,
            validationProfile: resolved.rail.validationProfile,
            submittedAt: submittedAt.toISOString(),
            singleStepSubmission: true,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'Deposit submitted for manual review.',
        deposit: this.depositSnapshot(deposit),
      };
    });
  }

  private async resolveDepositInput(
    transaction: Prisma.TransactionClient,
    dto: CreateDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<ResolvedDepositInput> {
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

    const activeSamePackage = await transaction.$queryRaw<
      Array<{ id: string }>
    >(Prisma.sql`
      SELECT ups.id
      FROM user_package_subscriptions ups
      WHERE ups.userId = ${actor.id}
        AND ups.packageDefinitionId = ${item.packageDefinition.id}
        AND ups.status = 'ACTIVE'
      LIMIT 1
      FOR UPDATE
    `);

    if (activeSamePackage.length > 0) {
      throw new ConflictException(
        'You already have an active subscription for this package.',
      );
    }

    if (
      plan.activationTrigger !== 'PAYMENT_APPROVED' &&
      plan.activationTrigger !== 'MANUAL_ACTIVATION'
    ) {
      throw new BadRequestException(
        `Package activation trigger ${plan.activationTrigger} is not available for deposit-funded activation yet.`,
      );
    }

    const rangeConfigured = item.minimumInvestment !== null;
    let investmentAmount: Prisma.Decimal;

    if (rangeConfigured) {
      if (item.durationDays === null) {
        throw new ServiceUnavailableException(
          'Selected package range is missing its duration snapshot.',
        );
      }

      if (!dto.investmentAmount) {
        throw new BadRequestException(
          'investmentAmount is required for this package range.',
        );
      }

      investmentAmount = new Prisma.Decimal(dto.investmentAmount);

      if (investmentAmount.lt(item.minimumInvestment!)) {
        throw new BadRequestException(
          `Investment amount must be at least ${item.minimumInvestment!.toFixed(8)} ${item.currency}.`,
        );
      }

      if (
        item.maximumInvestment !== null &&
        investmentAmount.gt(item.maximumInvestment)
      ) {
        throw new BadRequestException(
          `Investment amount must not exceed ${item.maximumInvestment.toFixed(8)} ${item.currency}.`,
        );
      }
    } else {
      investmentAmount = item.price;

      if (
        dto.investmentAmount &&
        !new Prisma.Decimal(dto.investmentAmount).equals(item.price)
      ) {
        throw new BadRequestException(
          `This legacy package requires the exact fixed amount ${item.price.toFixed(8)} ${item.currency}.`,
        );
      }
    }

    if (!investmentAmount.gt(0)) {
      throw new BadRequestException(
        'Investment amount must be greater than zero.',
      );
    }

    const rail = await transaction.depositPaymentRail.findFirst({
      where: {
        id: dto.paymentRailId,
        asset: item.currency,
        isActive: true,
      },
      select: PAYMENT_RAIL_SELECT,
    });

    if (!rail) {
      throw new BadRequestException(
        'Selected payment rail is not available for this package currency.',
      );
    }

    const permanent = await this.resolvePermanentAssignment(
      transaction,
      actor.id,
      rail,
      context,
    );

    return {
      plan,
      item,
      rangeConfigured,
      investmentAmount,
      rail,
      assignment: permanent.assignment,
      account: permanent.account,
    };
  }

  private async resolvePermanentAssignment(
    transaction: Prisma.TransactionClient,
    userId: string,
    rail: {
      id: string;
      asset: string;
      networkCode: string;
      displayName: string;
      validationProfile: DepositValidationProfile;
      isActive: boolean;
    },
    context: RequestContext,
  ) {
    const existingRows = await transaction.$queryRaw<AddressAssignmentRow[]>(
      Prisma.sql`
        SELECT id, userId, paymentRailId, depositAccountId, assignedAt
        FROM user_deposit_address_assignments
        WHERE userId = ${userId}
          AND paymentRailId = ${rail.id}
        LIMIT 1
        FOR UPDATE
      `,
    );
    const existing = existingRows[0] ?? null;

    if (existing) {
      const account = await transaction.depositAccount.findFirst({
        where: {
          id: existing.depositAccountId,
          paymentRailId: rail.id,
          isActive: true,
        },
        select: DEPOSIT_ACCOUNT_SELECT,
      });

      if (!account) {
        throw new ServiceUnavailableException(
          'Your permanent receiving address is temporarily unavailable. No automatic reassignment was performed.',
        );
      }

      return { assignment: existing, account, created: false };
    }

    const accounts = await transaction.depositAccount.findMany({
      where: {
        paymentRailId: rail.id,
        isActive: true,
      },
      select: DEPOSIT_ACCOUNT_SELECT,
      orderBy: { id: 'asc' },
    });

    if (accounts.length === 0) {
      throw new ServiceUnavailableException(
        `No active receiving account is configured for ${rail.displayName}.`,
      );
    }

    const account = accounts[randomInt(accounts.length)];
    const assignment: AddressAssignmentRow = {
      id: randomUUID(),
      userId,
      paymentRailId: rail.id,
      depositAccountId: account.id,
      assignedAt: new Date(),
    };

    await transaction.$executeRaw(
      Prisma.sql`
        INSERT INTO user_deposit_address_assignments (
          id, userId, paymentRailId, depositAccountId,
          assignedAt, createdAt, updatedAt
        ) VALUES (
          ${assignment.id}, ${assignment.userId}, ${assignment.paymentRailId},
          ${assignment.depositAccountId}, ${assignment.assignedAt},
          ${assignment.assignedAt}, ${assignment.assignedAt}
        )
      `,
    );

    await transaction.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'CREATE',
        entityType: 'UserDepositAddressAssignment',
        entityId: assignment.id,
        description: `Permanent ${rail.asset} ${rail.networkCode} receiving address assigned to user.`,
        metadata: {
          source: 'USER_DEPOSIT',
          operation: DEPOSIT_AUDIT_OPERATIONS.ASSIGN_PERMANENT_ADDRESS,
          paymentRailId: rail.id,
          depositAccountId: account.id,
          walletAddress: account.walletAddress,
          network: rail.networkCode,
          permanent: true,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return { assignment, account, created: true };
  }

  private async createDepositRecord(
    transaction: Prisma.TransactionClient,
    resolved: ResolvedDepositInput,
    actor: AuthenticatedUser,
    status: 'AWAITING_TXID' | 'PENDING_REVIEW',
    txid: string | null,
    submittedAt: Date | null,
    context: RequestContext,
  ) {
    const deposit = await transaction.deposit.create({
      data: {
        userId: actor.id,
        openKey: actor.id,
        status,
        packagePlanVersionId: resolved.plan.id,
        packagePlanItemId: resolved.item.id,
        packageCode: resolved.item.packageDefinition.code,
        packageDisplayName: resolved.item.displayName,
        amount: resolved.investmentAmount,
        packageMinimumInvestment: resolved.rangeConfigured
          ? resolved.item.minimumInvestment
          : null,
        packageMaximumInvestment: resolved.rangeConfigured
          ? resolved.item.maximumInvestment
          : null,
        packageDurationDays: resolved.rangeConfigured
          ? resolved.item.durationDays
          : null,
        packagePrincipalTreatment: resolved.rangeConfigured
          ? resolved.item.principalTreatment
          : null,
        currency: resolved.item.currency,
        assignedDepositAccountId: resolved.account.id,
        assignedAccountLabel: resolved.account.label,
        assignedWalletAddress: resolved.account.walletAddress,
        assignedNetwork: resolved.rail.networkCode,
        assignedValidationProfile: resolved.rail.validationProfile,
        assignedQrCodeDataUrl: resolved.account.qrCodeDataUrl,
        txid,
        submittedAt,
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
          packagePlanVersionId: resolved.plan.id,
          packagePlanItemId: resolved.item.id,
          packageCode: resolved.item.packageDefinition.code,
          amount: resolved.investmentAmount.toFixed(8),
          currency: resolved.item.currency,
          packageMinimumInvestment:
            resolved.item.minimumInvestment?.toFixed(8) ?? null,
          packageMaximumInvestment:
            resolved.item.maximumInvestment?.toFixed(8) ?? null,
          packageDurationDays: resolved.item.durationDays,
          packagePrincipalTreatment: resolved.item.principalTreatment,
          paymentRailId: resolved.rail.id,
          permanentAddressAssignmentId: resolved.assignment.id,
          assignedDepositAccountId: resolved.account.id,
          assignedWalletAddress: resolved.account.walletAddress,
          assignedNetwork: resolved.rail.networkCode,
          assignedValidationProfile: resolved.rail.validationProfile,
          singleStepSubmission: status === 'PENDING_REVIEW',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return deposit;
  }

  private assignmentSnapshot(
    assignment: AddressAssignmentRow,
    rail: {
      asset: string;
      networkCode: string;
      displayName: string;
      validationProfile: DepositValidationProfile;
    },
    account: {
      walletAddress: string;
      qrCodeDataUrl: string;
    },
  ) {
    return {
      id: assignment.id,
      userId: assignment.userId,
      paymentRailId: assignment.paymentRailId,
      depositAccountId: assignment.depositAccountId,
      asset: rail.asset,
      networkCode: rail.networkCode,
      displayName: rail.displayName,
      validationProfile: rail.validationProfile,
      walletAddress: account.walletAddress,
      qrCodeDataUrl: account.qrCodeDataUrl,
      assignedAt: assignment.assignedAt,
      permanent: true,
    };
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
    packageMinimumInvestment: Prisma.Decimal | null;
    packageMaximumInvestment: Prisma.Decimal | null;
    packageDurationDays: number | null;
    packagePrincipalTreatment: string | null;
    currency: string;
    assignedDepositAccountId: string;
    assignedAccountLabel: string;
    assignedWalletAddress: string;
    assignedNetwork: string;
    assignedValidationProfile: DepositValidationProfile;
    assignedQrCodeDataUrl: string;
    txid: string | null;
    submittedAt: Date | null;
    readyForApprovalByUserId: string | null;
    readyForApprovalAt: Date | null;
    readyForApprovalNote: string | null;
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
    readyForApprovalBy: {
      id: string;
      username: string;
      email: string | null;
    } | null;
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
      packageMinimumInvestment: deposit.packageMinimumInvestment
        ? this.decimalString(deposit.packageMinimumInvestment)
        : null,
      packageMaximumInvestment: deposit.packageMaximumInvestment
        ? this.decimalString(deposit.packageMaximumInvestment)
        : null,
      packageDurationDays: deposit.packageDurationDays,
      packagePrincipalTreatment: deposit.packagePrincipalTreatment,
      currency: deposit.currency,
      assignedDepositAccountId: deposit.assignedDepositAccountId,
      assignedAccountLabel: deposit.assignedAccountLabel,
      assignedWalletAddress: deposit.assignedWalletAddress,
      assignedNetwork: deposit.assignedNetwork,
      assignedValidationProfile: deposit.assignedValidationProfile,
      assignedQrCodeDataUrl: deposit.assignedQrCodeDataUrl,
      txid: deposit.txid,
      submittedAt: deposit.submittedAt,
      readyForApprovalByUserId: deposit.readyForApprovalByUserId,
      readyForApprovalAt: deposit.readyForApprovalAt,
      readyForApprovalNote: deposit.readyForApprovalNote,
      reviewedByUserId: deposit.reviewedByUserId,
      reviewedAt: deposit.reviewedAt,
      reviewNote: deposit.reviewNote,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
      user: deposit.user,
      readyForApprovalBy: deposit.readyForApprovalBy,
      reviewedBy: deposit.reviewedBy,
    };
  }

  private decimalString(value: Prisma.Decimal): string {
    return value.toFixed(8).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '');
  }

  private async runSerializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt === 0
        ) {
          continue;
        }

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

          if (
            (target.includes('uda_user_rail_uq') ||
              (target.includes('userId') &&
                target.includes('paymentRailId'))) &&
            attempt === 0
          ) {
            continue;
          }

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
        }

        throw error;
      }
    }

    throw new ConflictException(
      'Permanent receiving address changed concurrently; reload and retry.',
    );
  }
}
