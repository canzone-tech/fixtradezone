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
import type { ApplyClientPackageProfileDto } from './dto/apply-client-package-profile.dto';

const CLIENT_PACKAGE_PROFILE = [
  {
    packageCode: 'NEURAL_SCOUT',
    displayName: 'FTZ AlphaBotc',
    slug: 'ftz-alphabotc',
    minimumInvestment: '5.00000000',
    maximumInvestment: '24.00000000',
    durationDays: 10,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'NEURAL_VOYAGER',
    displayName: 'FTZ BullBot',
    slug: 'ftz-bullbot',
    minimumInvestment: '25.00000000',
    maximumInvestment: '49.00000000',
    durationDays: 15,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'NEURAL_NAVIGATOR',
    displayName: 'FTZ CryptoBot',
    slug: 'ftz-cryptobot',
    minimumInvestment: '50.00000000',
    maximumInvestment: '99.00000000',
    durationDays: 20,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'NEURAL_STRATEGIST',
    displayName: 'FTZ DynamoBot',
    slug: 'ftz-dynamobot',
    minimumInvestment: '100.00000000',
    maximumInvestment: '499.00000000',
    durationDays: 25,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'QUANT_CORE',
    displayName: 'FTZ EliteBot',
    slug: 'ftz-elitebot',
    minimumInvestment: '500.00000000',
    maximumInvestment: '999.00000000',
    durationDays: 30,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'QUANT_PRIME',
    displayName: 'FTZ JupiterBot',
    slug: 'ftz-jupiterbot',
    minimumInvestment: '1000.00000000',
    maximumInvestment: '1999.00000000',
    durationDays: 60,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'QUANT_APEX',
    displayName: 'FTZ LegendBot',
    slug: 'ftz-legendbot',
    minimumInvestment: '2000.00000000',
    maximumInvestment: '3999.00000000',
    durationDays: 90,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'QUANT_TITAN',
    displayName: 'FTZ NovaBot',
    slug: 'ftz-novabot',
    minimumInvestment: '4000.00000000',
    maximumInvestment: '4999.00000000',
    durationDays: 120,
    principalTreatment: 'RETURN_SEPARATELY' as const,
  },
  {
    packageCode: 'QUANT_SOVEREIGN',
    displayName: 'FTZ PrimeBot',
    slug: 'ftz-primebot',
    minimumInvestment: '5000.00000000',
    maximumInvestment: null,
    durationDays: 150,
    principalTreatment: 'NON_REFUNDABLE_PACKAGE_VALUE' as const,
  },
] as const;

@Injectable()
export class ClientPackageProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(
    planVersionId: string,
    dto: ApplyClientPackageProfileDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const plan = await transaction.packagePlanVersion.findUnique({
          where: { id: planVersionId },
          include: {
            items: {
              include: { packageDefinition: true },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            },
          },
        });

        if (!plan) {
          throw new BadRequestException('Package plan version was not found.');
        }

        if (plan.status !== 'DRAFT') {
          throw new ConflictException(
            'Published package-plan terms are immutable; clone a new draft first.',
          );
        }

        if (plan.revision !== dto.expectedRevision) {
          throw new ConflictException(
            `Package plan revision is stale. Current revision is ${plan.revision}.`,
          );
        }

        const byCode = new Map(
          plan.items.map((item) => [item.packageDefinition.code, item]),
        );
        const expectedCodes = new Set(
          CLIENT_PACKAGE_PROFILE.map((entry) => entry.packageCode),
        );
        const unexpected = plan.items.filter(
          (item) => !expectedCodes.has(item.packageDefinition.code as never),
        );
        const missing = CLIENT_PACKAGE_PROFILE.filter(
          (entry) => !byCode.has(entry.packageCode),
        );

        if (
          missing.length > 0 ||
          unexpected.length > 0 ||
          plan.items.length !== 9
        ) {
          throw new BadRequestException(
            'The client package profile requires exactly the nine canonical FixTradeZone package definitions.',
          );
        }

        const before = {
          revision: plan.revision,
          activePackageMode: plan.activePackageMode,
          items: plan.items.map((item) => ({
            packageCode: item.packageDefinition.code,
            displayName: item.displayName,
            price: item.price.toFixed(8),
            minimumInvestment: item.minimumInvestment?.toFixed(8) ?? null,
            maximumInvestment: item.maximumInvestment?.toFixed(8) ?? null,
            durationDays: item.durationDays,
            principalTreatment: item.principalTreatment,
            goalDays: item.goalDays,
            cycleDays: item.cycleDays,
          })),
        };

        const bumped = await transaction.packagePlanVersion.updateMany({
          where: {
            id: plan.id,
            status: 'DRAFT',
            revision: dto.expectedRevision,
          },
          data: {
            activePackageMode: 'MULTIPLE_ACTIVE',
            multipleActivePackageBasis: 'HIGHEST_ACTIVE_PACKAGE',
            migrationMode: 'NEW_PACKAGE_ACTIVATIONS',
            renewalMode: 'MANUAL_AFTER_TERMINAL',
            upgradesEnabled: false,
            revision: { increment: 1 },
            updatedByUserId: actor.id,
          },
        });

        if (bumped.count !== 1) {
          throw new ConflictException(
            'Package plan changed concurrently; reload and retry.',
          );
        }

        for (const profile of CLIENT_PACKAGE_PROFILE) {
          const item = byCode.get(profile.packageCode);
          if (!item) {
            throw new ServiceUnavailableException(
              'Canonical package definition disappeared during profile application.',
            );
          }

          await transaction.packagePlanItem.update({
            where: { id: item.id },
            data: {
              displayName: profile.displayName,
              slug: profile.slug,
              price: new Prisma.Decimal(profile.minimumInvestment),
              minimumInvestment: new Prisma.Decimal(profile.minimumInvestment),
              maximumInvestment: profile.maximumInvestment
                ? new Prisma.Decimal(profile.maximumInvestment)
                : null,
              durationDays: profile.durationDays,
              principalTreatment: profile.principalTreatment,
              goalDays: profile.durationDays,
              cycleDays: profile.durationDays,
              cycleEndAction: 'COMPLETE_PACKAGE',
            },
          });
        }

        const afterPlan = await transaction.packagePlanVersion.findUnique({
          where: { id: plan.id },
          include: {
            items: {
              include: { packageDefinition: true },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            },
          },
        });

        if (!afterPlan) {
          throw new ServiceUnavailableException(
            'Updated package plan could not be read back.',
          );
        }

        const after = {
          revision: afterPlan.revision,
          activePackageMode: afterPlan.activePackageMode,
          items: afterPlan.items.map((item) => ({
            packageCode: item.packageDefinition.code,
            displayName: item.displayName,
            minimumInvestment: item.minimumInvestment?.toFixed(8) ?? null,
            maximumInvestment: item.maximumInvestment?.toFixed(8) ?? null,
            durationDays: item.durationDays,
            principalTreatment: item.principalTreatment,
          })),
        };

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'PackagePlanVersion',
            entityId: plan.id,
            description:
              'SUPER_ADMIN applied the locked FixTradeZone client package range and lifecycle profile to a draft.',
            metadata: {
              source: 'ADMIN_PACKAGE_PLAN',
              operation: 'APPLY_CLIENT_PACKAGE_PROFILE',
              reason: dto.reason,
              before,
              after,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Locked client package profile applied to draft.',
          planVersionId: plan.id,
          revision: afterPlan.revision,
          profile: after,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
