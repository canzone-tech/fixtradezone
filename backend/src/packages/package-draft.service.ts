import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { CreatePackagePlanDraftDto } from './dto/package-plan.dto';
import { toPlanSnapshot } from './package-plan.mapper';
import { PLAN_INCLUDE } from './packages.types';

type PackageDraftInput = Omit<
  CreatePackagePlanDraftDto,
  'sourcePlanVersionId'
> & {
  sourcePlanVersionId?: string;
};

@Injectable()
export class PackageDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(
    dto: PackageDraftInput,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const existingDraft = await transaction.packagePlanVersion.findFirst({
        where: { status: 'DRAFT' },
        select: { id: true, versionNumber: true },
      });

      if (existingDraft) {
        throw new ConflictException(
          `Package plan V${existingDraft.versionNumber} is already the active draft.`,
        );
      }

      const latest = await transaction.packagePlanVersion.findFirst({
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

      if (!dto.sourcePlanVersionId) {
        if (latest) {
          throw new BadRequestException(
            'sourcePlanVersionId is required after package-plan history exists.',
          );
        }

        const created = await transaction.packagePlanVersion.create({
          data: {
            versionNumber: 1,
            status: 'DRAFT',
            revision: 1,
            createdByUserId: actor.id,
            updatedByUserId: actor.id,
          },
          include: PLAN_INCLUDE,
        });

        const after = toPlanSnapshot(created);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'CREATE',
            entityType: 'PackagePlanVersion',
            entityId: created.id,
            description:
              'Administrator created the initial empty database-backed package-plan draft.',
            metadata: {
              source: 'ADMIN_PACKAGE_PLAN',
              operation: 'CREATE_INITIAL_DRAFT',
              reason: dto.reason,
              revision: created.revision,
              before: null,
              after,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Package plan V1 initial draft created.',
          plan: after,
        };
      }

      const source = await transaction.packagePlanVersion.findUnique({
        where: { id: dto.sourcePlanVersionId },
        include: PLAN_INCLUDE,
      });

      if (!source) {
        throw new NotFoundException('Package plan version was not found.');
      }

      if (source.status !== 'PUBLISHED') {
        throw new BadRequestException(
          'A successor draft must be cloned from a published plan version.',
        );
      }

      const created = await transaction.packagePlanVersion.create({
        data: {
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          status: 'DRAFT',
          revision: 1,
          activePackageMode: source.activePackageMode,
          multipleActivePackageBasis: source.multipleActivePackageBasis,
          activationTrigger: source.activationTrigger,
          migrationMode: source.migrationMode,
          renewalMode: source.renewalMode,
          upgradesEnabled: source.upgradesEnabled,
          settlementTimezone: source.settlementTimezone,
          clonedFromPlanVersionId: source.id,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          items: {
            create: source.items.map((item) => ({
              packageDefinitionId: item.packageDefinitionId,
              displayName: item.displayName,
              slug: item.slug,
              sortOrder: item.sortOrder,
              availability: item.availability,
              price: item.price,
              minimumInvestment: item.minimumInvestment,
              maximumInvestment: item.maximumInvestment,
              durationDays: item.durationDays,
              currency: item.currency,
              rewardRateMode: item.rewardRateMode,
              fixedRewardRate: item.fixedRewardRate,
              minimumRewardRate: item.minimumRewardRate,
              maximumRewardRate: item.maximumRewardRate,
              rewardRateMeaning: item.rewardRateMeaning,
              capBasis: item.capBasis,
              capMultiplier: item.capMultiplier,
              principalTreatment: item.principalTreatment,
              goalDays: item.goalDays,
              cycleDays: item.cycleDays,
              rewardStartMode: item.rewardStartMode,
              rewardFrequency: item.rewardFrequency,
              cycleDayMode: item.cycleDayMode,
              rewardDayMode: item.rewardDayMode,
              cycleEndAction: item.cycleEndAction,
              capReachedAction: item.capReachedAction,
            })),
          },
        },
        include: PLAN_INCLUDE,
      });

      const after = toPlanSnapshot(created);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'PackagePlanVersion',
          entityId: created.id,
          description:
            'Administrator cloned a published package plan into a successor draft.',
          metadata: {
            source: 'ADMIN_PACKAGE_PLAN',
            operation: 'CLONE_DRAFT',
            reason: dto.reason,
            sourcePlanVersionId: source.id,
            revision: created.revision,
            before: null,
            after,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: `Package plan V${created.versionNumber} draft created.`,
        plan: after,
      };
    });
  }

  private async runSerializable<Result>(
    operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Result> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Package-plan data conflicts with an existing unique value.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Package-plan state changed concurrently; reload and retry.',
        );
      }

      throw error;
    }
  }
}
