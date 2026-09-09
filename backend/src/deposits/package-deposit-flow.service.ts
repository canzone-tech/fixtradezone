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
import type { SubmitPackageDepositDto } from './dto/deposit.dto';
import {
  DEPOSIT_AUDIT_OPERATIONS,
  type DepositStatus,
  type DepositValidationProfile,
} from './deposits.constants';

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

interface PackageRouteRow {
  depositAccountId: string;
  accountLabel: string;
  paymentRailId: string;
  asset: string;
  network: string;
  walletAddress: string;
  qrCodeDataUrl: string;
  accountIsActive: boolean | number;
  railDisplayName: string;
  validationProfile: DepositValidationProfile;
  railIsActive: boolean | number;
}

interface ResolvedPackageDepositInput {
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
  account: PackageRouteRow;
}

@Injectable()
export class PackageDepositFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async getPackageDepositContext(
    packagePlanItemId: string,
    actor: AuthenticatedUser,
  ) {
    const now = new Date();
    const plans = await this.prisma.packagePlanVersion.findMany({
      where: {
        status: 'PUBLISHED',
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        items: {
          some: {
            id: packagePlanItemId,
            availability: 'AVAILABLE',
          },
        },
      },
      include: {
        items: {
          where: { id: packagePlanItemId },
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

    this.assertActivationTrigger(plan.activationTrigger);

    const routeRows = await this.prisma.$queryRaw<PackageRouteRow[]>(Prisma.sql`
      SELECT
        da.id AS depositAccountId,
        da.label AS accountLabel,
        da.paymentRailId AS paymentRailId,
        da.asset AS asset,
        da.network AS network,
        da.walletAddress AS walletAddress,
        da.qrCodeDataUrl AS qrCodeDataUrl,
        da.isActive AS accountIsActive,
        dpr.displayName AS railDisplayName,
        dpr.validationProfile AS validationProfile,
        dpr.isActive AS railIsActive
      FROM deposit_package_account_routes dpar
      INNER JOIN deposit_accounts da
        ON da.id = dpar.depositAccountId
      INNER JOIN deposit_payment_rails dpr
        ON dpr.id = da.paymentRailId
      WHERE dpar.packageDefinitionId = ${item.packageDefinition.id}
      LIMIT 1
    `);

    const account = this.assertConfiguredAccount(
      routeRows[0] ?? null,
      item.currency,
    );

    const openDeposit = await this.prisma.deposit.findUnique({
      where: { openKey: actor.id },
      select: {
        id: true,
        status: true,
        packagePlanItemId: true,
        packageDisplayName: true,
      },
    });

    return {
      package: {
        id: item.id,
        packageDefinitionId: item.packageDefinition.id,
        packageCode: item.packageDefinition.code,
        displayName: item.displayName,
        currency: item.currency,
        price: this.decimalString(item.price),
        minimumInvestment: item.minimumInvestment
          ? this.decimalString(item.minimumInvestment)
          : null,
        maximumInvestment: item.maximumInvestment
          ? this.decimalString(item.maximumInvestment)
          : null,
        durationDays: item.durationDays,
      },
      receivingAccount: this.accountSnapshot(account),
      openDeposit,
    };
  }

  async submitDeposit(
    dto: SubmitPackageDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const resolved = await this.resolveDepositInput(transaction, dto, actor);
      const normalizedTxid = normalizeDepositTransactionId(
        resolved.account.validationProfile,
        dto.txid,
      );

      if (!normalizedTxid) {
        throw new BadRequestException(
          `Transaction ID is invalid for ${resolved.account.network}.`,
        );
      }

      const submittedAt = new Date();
      const deposit = await transaction.deposit.create({
        data: {
          userId: actor.id,
          openKey: actor.id,
          status: 'PENDING_REVIEW',
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
          assignedDepositAccountId: resolved.account.depositAccountId,
          assignedAccountLabel: resolved.account.accountLabel,
          assignedWalletAddress: resolved.account.walletAddress,
          assignedNetwork: resolved.account.network,
          assignedValidationProfile: resolved.account.validationProfile,
          assignedQrCodeDataUrl: resolved.account.qrCodeDataUrl,
          txid: normalizedTxid,
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
          description: 'User submitted a package deposit for manual review.',
          metadata: {
            source: 'USER_DEPOSIT',
            operation: DEPOSIT_AUDIT_OPERATIONS.SUBMIT_PACKAGE_DEPOSIT,
            packagePlanVersionId: resolved.plan.id,
            packagePlanItemId: resolved.item.id,
            packageDefinitionId: resolved.item.packageDefinition.id,
            packageCode: resolved.item.packageDefinition.code,
            amount: resolved.investmentAmount.toFixed(8),
            currency: resolved.item.currency,
            assignedDepositAccountId: resolved.account.depositAccountId,
            assignedWalletAddress: resolved.account.walletAddress,
            assignedNetwork: resolved.account.network,
            assignedValidationProfile: resolved.account.validationProfile,
            txid: normalizedTxid,
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
    dto: SubmitPackageDepositDto,
    actor: AuthenticatedUser,
  ): Promise<ResolvedPackageDepositInput> {
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

    this.assertActivationTrigger(plan.activationTrigger);

    const activeSamePackage = await transaction.$queryRaw<
      Array<{ id: string }>
    >(
      Prisma.sql`
        SELECT ups.id
        FROM user_package_subscriptions ups
        WHERE ups.userId = ${actor.id}
          AND ups.packageDefinitionId = ${item.packageDefinition.id}
          AND ups.status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE
      `,
    );

    if (activeSamePackage.length > 0) {
      throw new ConflictException(
        'You already have an active subscription for this package.',
      );
    }

    const routeRows = await transaction.$queryRaw<PackageRouteRow[]>(Prisma.sql`
      SELECT
        da.id AS depositAccountId,
        da.label AS accountLabel,
        da.paymentRailId AS paymentRailId,
        da.asset AS asset,
        da.network AS network,
        da.walletAddress AS walletAddress,
        da.qrCodeDataUrl AS qrCodeDataUrl,
        da.isActive AS accountIsActive,
        dpr.displayName AS railDisplayName,
        dpr.validationProfile AS validationProfile,
        dpr.isActive AS railIsActive
      FROM deposit_package_account_routes dpar
      INNER JOIN deposit_accounts da
        ON da.id = dpar.depositAccountId
      INNER JOIN deposit_payment_rails dpr
        ON dpr.id = da.paymentRailId
      WHERE dpar.packageDefinitionId = ${item.packageDefinition.id}
      LIMIT 1
      FOR UPDATE
    `);

    const account = this.assertConfiguredAccount(
      routeRows[0] ?? null,
      item.currency,
    );
    const rangeConfigured = item.minimumInvestment !== null;
    const investmentAmount = this.resolveInvestmentAmount(
      item,
      dto.investmentAmount,
    );

    return {
      plan,
      item,
      rangeConfigured,
      investmentAmount,
      account,
    };
  }

  private resolveInvestmentAmount(
    item: {
      price: Prisma.Decimal;
      minimumInvestment: Prisma.Decimal | null;
      maximumInvestment: Prisma.Decimal | null;
      durationDays: number | null;
      currency: string;
    },
    suppliedAmount?: string,
  ): Prisma.Decimal {
    if (item.minimumInvestment !== null) {
      if (item.durationDays === null) {
        throw new ServiceUnavailableException(
          'Selected package range is missing its duration snapshot.',
        );
      }

      if (!suppliedAmount) {
        throw new BadRequestException(
          'investmentAmount is required for this package range.',
        );
      }

      const investmentAmount = new Prisma.Decimal(suppliedAmount);
      if (investmentAmount.lt(item.minimumInvestment)) {
        throw new BadRequestException(
          `Investment amount must be at least ${item.minimumInvestment.toFixed(8)} ${item.currency}.`,
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

      return investmentAmount;
    }

    if (
      suppliedAmount &&
      !new Prisma.Decimal(suppliedAmount).equals(item.price)
    ) {
      throw new BadRequestException(
        `This legacy package requires the exact fixed amount ${item.price.toFixed(8)} ${item.currency}.`,
      );
    }

    if (!item.price.gt(0)) {
      throw new BadRequestException(
        'Investment amount must be greater than zero.',
      );
    }

    return item.price;
  }

  private assertActivationTrigger(trigger: string) {
    if (trigger !== 'PAYMENT_APPROVED' && trigger !== 'MANUAL_ACTIVATION') {
      throw new BadRequestException(
        `Package activation trigger ${trigger} is not available for deposit-funded activation yet.`,
      );
    }
  }

  private assertConfiguredAccount(
    route: PackageRouteRow | null,
    packageCurrency: string,
  ): PackageRouteRow {
    if (!route) {
      throw new ServiceUnavailableException(
        'No receiving account is configured for this package.',
      );
    }

    if (!route.accountIsActive || !route.railIsActive) {
      throw new ServiceUnavailableException(
        'The receiving account configured for this package is currently unavailable.',
      );
    }

    if (route.asset !== packageCurrency) {
      throw new ServiceUnavailableException(
        'The receiving account configured for this package does not match the package currency.',
      );
    }

    return route;
  }

  private accountSnapshot(account: PackageRouteRow) {
    return {
      id: account.depositAccountId,
      label: account.accountLabel,
      paymentRailId: account.paymentRailId,
      paymentRailDisplayName: account.railDisplayName,
      asset: account.asset,
      network: account.network,
      walletAddress: account.walletAddress,
      qrCodeDataUrl: account.qrCodeDataUrl,
      validationProfile: account.validationProfile,
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
      'Deposit submission changed concurrently; reload and retry.',
    );
  }
}
