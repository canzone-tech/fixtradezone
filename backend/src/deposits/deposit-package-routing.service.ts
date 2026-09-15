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
import { isValidDepositAddress } from './deposit.validation';
import type {
  ConfigureDepositPackageAccountDto,
  CreatePackageDepositAccountDto,
} from './dto/deposit.dto';
import { DEPOSIT_AUDIT_OPERATIONS } from './deposits.constants';

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
  paymentRail: {
    select: PAYMENT_RAIL_SELECT,
  },
} as const;

interface PackageRouteRow {
  packageDefinitionId: string;
  depositAccountId: string;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DepositPackageRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async listPackageRoutes() {
    const now = new Date();
    const plans = await this.prisma.packagePlanVersion.findMany({
      where: {
        status: 'PUBLISHED',
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      include: {
        items: {
          include: { packageDefinition: true },
          orderBy: { sortOrder: 'asc' },
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

    const routes = await this.prisma.$queryRaw<PackageRouteRow[]>(Prisma.sql`
      SELECT
        packageDefinitionId,
        depositAccountId,
        updatedByUserId,
        createdAt,
        updatedAt
      FROM deposit_package_account_routes
    `);
    const routeByPackage = new Map(
      routes.map((route) => [route.packageDefinitionId, route]),
    );

    return {
      planVersionId: plans[0]?.id ?? null,
      planVersionNumber: plans[0]?.versionNumber ?? null,
      packages: (plans[0]?.items ?? []).map((item) => {
        const route = routeByPackage.get(item.packageDefinition.id) ?? null;
        return {
          packageDefinitionId: item.packageDefinition.id,
          packagePlanItemId: item.id,
          packageCode: item.packageDefinition.code,
          displayName: item.displayName,
          currency: item.currency,
          sortOrder: item.sortOrder,
          availability: item.availability,
          depositAccountId: route?.depositAccountId ?? null,
          routeUpdatedAt: route?.updatedAt ?? null,
        };
      }),
    };
  }

  async createPackageAccount(
    dto: CreatePackageDepositAccountDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const packageDefinition =
          await transaction.packageDefinition.findUnique({
            where: { id: dto.packageDefinitionId },
            select: { id: true, code: true },
          });

        if (!packageDefinition) {
          throw new NotFoundException('Package definition was not found.');
        }

        const existingRoutes = await transaction.$queryRaw<PackageRouteRow[]>(
          Prisma.sql`
            SELECT
              packageDefinitionId,
              depositAccountId,
              updatedByUserId,
              createdAt,
              updatedAt
            FROM deposit_package_account_routes
            WHERE packageDefinitionId = ${dto.packageDefinitionId}
            LIMIT 1
            FOR UPDATE
          `,
        );

        if (existingRoutes.length > 0) {
          throw new ConflictException(
            'This package already has a receiving account. Edit the existing account instead of creating another package account.',
          );
        }

        const now = new Date();
        const plans = await transaction.packagePlanVersion.findMany({
          where: {
            status: 'PUBLISHED',
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            items: {
              some: { packageDefinitionId: dto.packageDefinitionId },
            },
          },
          include: {
            items: {
              where: { packageDefinitionId: dto.packageDefinitionId },
              select: { id: true, currency: true, displayName: true },
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

        const item = plans[0]?.items[0];
        if (!item) {
          throw new BadRequestException(
            'Package is not present in the effective published catalogue.',
          );
        }

        const rail = await transaction.depositPaymentRail.findUnique({
          where: { id: dto.paymentRailId },
          select: PAYMENT_RAIL_SELECT,
        });

        if (!rail) {
          throw new NotFoundException('Deposit payment rail was not found.');
        }

        if (!rail.isActive) {
          throw new BadRequestException(
            'A package receiving account can only be created on an active payment rail.',
          );
        }

        if (rail.asset !== item.currency) {
          throw new BadRequestException(
            `Package ${item.displayName} requires ${item.currency}; the selected rail receives ${rail.asset}.`,
          );
        }

        if (!isValidDepositAddress(rail.validationProfile, dto.walletAddress)) {
          throw new BadRequestException(
            `Receiving address is invalid for ${rail.networkCode}.`,
          );
        }

        const account = await transaction.depositAccount.create({
          data: {
            label: item.displayName,
            paymentRailId: rail.id,
            asset: rail.asset,
            network: rail.networkCode,
            walletAddress: dto.walletAddress,
            qrCodeDataUrl: dto.qrCodeDataUrl,
            isActive: true,
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
          },
          select: DEPOSIT_ACCOUNT_SELECT,
        });

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO deposit_package_account_routes (
            packageDefinitionId,
            depositAccountId,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${dto.packageDefinitionId},
            ${account.id},
            ${actor.id},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
        `);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'CREATE',
            entityType: 'DepositAccount',
            entityId: account.id,
            description: `Administrator created the package receiving account for ${packageDefinition.code}.`,
            metadata: {
              source: 'ADMIN_DEPOSIT_PACKAGE_ACCOUNT',
              operation: DEPOSIT_AUDIT_OPERATIONS.CREATE_ACCOUNT,
              reason: dto.reason,
              packageDefinitionId: dto.packageDefinitionId,
              packagePlanItemId: item.id,
              packageCode: packageDefinition.code,
              accountLabel: account.label,
              walletAddress: account.walletAddress,
              asset: account.asset,
              network: account.network,
              paymentRailId: account.paymentRailId,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'PackageDefinition',
            entityId: dto.packageDefinitionId,
            description: `Administrator configured deposit account ${account.label} for package ${packageDefinition.code}.`,
            metadata: {
              source: 'ADMIN_DEPOSIT_PACKAGE_ROUTE',
              operation: DEPOSIT_AUDIT_OPERATIONS.CONFIGURE_PACKAGE_ACCOUNT,
              reason: dto.reason,
              beforeDepositAccountId: null,
              afterDepositAccountId: account.id,
              accountLabel: account.label,
              walletAddress: account.walletAddress,
              asset: account.asset,
              network: account.network,
              paymentRailId: account.paymentRailId,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: `${item.displayName} receiving account created and assigned.`,
          packageDefinitionId: dto.packageDefinitionId,
          depositAccountId: account.id,
          account,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async configurePackageRoute(
    packageDefinitionId: string,
    dto: ConfigureDepositPackageAccountDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const packageDefinition =
          await transaction.packageDefinition.findUnique({
            where: { id: packageDefinitionId },
            select: { id: true, code: true },
          });

        if (!packageDefinition) {
          throw new NotFoundException('Package definition was not found.');
        }

        const beforeRows = await transaction.$queryRaw<
          PackageRouteRow[]
        >(Prisma.sql`
          SELECT
            packageDefinitionId,
            depositAccountId,
            updatedByUserId,
            createdAt,
            updatedAt
          FROM deposit_package_account_routes
          WHERE packageDefinitionId = ${packageDefinitionId}
          LIMIT 1
          FOR UPDATE
        `);
        const before = beforeRows[0] ?? null;

        if (dto.depositAccountId === null) {
          await transaction.$executeRaw(Prisma.sql`
            DELETE FROM deposit_package_account_routes
            WHERE packageDefinitionId = ${packageDefinitionId}
          `);

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'UPDATE',
              entityType: 'PackageDefinition',
              entityId: packageDefinitionId,
              description: `Administrator removed the deposit receiving account from package ${packageDefinition.code}.`,
              metadata: {
                source: 'ADMIN_DEPOSIT_PACKAGE_ROUTE',
                operation: DEPOSIT_AUDIT_OPERATIONS.CONFIGURE_PACKAGE_ACCOUNT,
                reason: dto.reason,
                beforeDepositAccountId: before?.depositAccountId ?? null,
                afterDepositAccountId: null,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return {
            message: 'Package receiving account removed.',
            packageDefinitionId,
            depositAccountId: null,
          };
        }

        const now = new Date();
        const plans = await transaction.packagePlanVersion.findMany({
          where: {
            status: 'PUBLISHED',
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            items: {
              some: { packageDefinitionId },
            },
          },
          include: {
            items: {
              where: { packageDefinitionId },
              select: { id: true, currency: true, displayName: true },
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

        const item = plans[0]?.items[0];
        if (!item) {
          throw new BadRequestException(
            'Package is not present in the effective published catalogue.',
          );
        }

        const account = await transaction.depositAccount.findUnique({
          where: { id: dto.depositAccountId },
          include: { paymentRail: true },
        });

        if (!account) {
          throw new NotFoundException('Deposit account was not found.');
        }

        if (!account.isActive || !account.paymentRail.isActive) {
          throw new BadRequestException(
            'Only an active account on an active payment rail can be assigned to a package.',
          );
        }

        if (account.asset !== item.currency) {
          throw new BadRequestException(
            `Package ${item.displayName} requires ${item.currency}; the selected account receives ${account.asset}.`,
          );
        }

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO deposit_package_account_routes (
            packageDefinitionId,
            depositAccountId,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${packageDefinitionId},
            ${account.id},
            ${actor.id},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            depositAccountId = VALUES(depositAccountId),
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = CURRENT_TIMESTAMP(3)
        `);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'PackageDefinition',
            entityId: packageDefinitionId,
            description: `Administrator configured deposit account ${account.label} for package ${packageDefinition.code}.`,
            metadata: {
              source: 'ADMIN_DEPOSIT_PACKAGE_ROUTE',
              operation: DEPOSIT_AUDIT_OPERATIONS.CONFIGURE_PACKAGE_ACCOUNT,
              reason: dto.reason,
              beforeDepositAccountId: before?.depositAccountId ?? null,
              afterDepositAccountId: account.id,
              accountLabel: account.label,
              walletAddress: account.walletAddress,
              asset: account.asset,
              network: account.network,
              paymentRailId: account.paymentRailId,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Package receiving account configured.',
          packageDefinitionId,
          depositAccountId: account.id,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
