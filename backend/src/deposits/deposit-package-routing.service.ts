import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ConfigureDepositPackageAccountDto } from './dto/deposit.dto';
import { DEPOSIT_AUDIT_OPERATIONS } from './deposits.constants';

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

  async configurePackageRoute(
    packageDefinitionId: string,
    dto: ConfigureDepositPackageAccountDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const packageDefinition = await transaction.packageDefinition.findUnique({
          where: { id: packageDefinitionId },
          select: { id: true, code: true },
        });

        if (!packageDefinition) {
          throw new NotFoundException('Package definition was not found.');
        }

        const beforeRows = await transaction.$queryRaw<PackageRouteRow[]>(Prisma.sql`
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
