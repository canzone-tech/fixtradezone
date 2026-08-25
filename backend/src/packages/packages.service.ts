import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  CreatePackagePlanDraftDto,
  CreatePackagePlanItemDto,
  PublishPackagePlanDto,
  UpdatePackagePlanDto,
  UpdatePackagePlanItemDto,
} from './dto/package-plan.dto';
import {
  createDtoTerms,
  mergeItemTerms,
  toItemSnapshot,
  toPlanSnapshot,
  toPublicPlanSnapshot,
} from './package-plan.mapper';
import {
  assertPublishablePlan,
  assertValidTimezone,
  parsePackagePlanDate,
  validateAndConvertItemTerms,
} from './package-plan.validation';
import { PLAN_INCLUDE, type PlanWithItems } from './packages.types';

const MIN_PUBLICATION_LEAD_MS = 0;

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveCatalogue(at = new Date()) {
    const plans = await this.prisma.packagePlanVersion.findMany({
      where: {
        status: 'PUBLISHED',
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      include: PLAN_INCLUDE,
      orderBy: [{ effectiveFrom: 'desc' }, { versionNumber: 'desc' }],
      take: 2,
    });

    if (plans.length > 1) {
      throw new ServiceUnavailableException(
        'Package catalogue has overlapping effective plan versions.',
      );
    }

    const plan = plans[0];

    if (!plan) {
      return {
        catalogueAvailable: false,
        activationAvailable: false,
        reason: 'NO_EFFECTIVE_PUBLISHED_PLAN' as const,
        plan: null,
        items: [],
      };
    }

    return {
      catalogueAvailable: true,
      activationAvailable: false,
      reason: 'PACKAGE_ACTIVATION_DEFERRED' as const,
      plan: toPublicPlanSnapshot(plan),
      items: plan.items
        .filter((item) => item.availability !== 'HIDDEN')
        .map((item) => toItemSnapshot(item)),
    };
  }

  async listPlanVersions() {
    const plans = await this.prisma.packagePlanVersion.findMany({
      orderBy: { versionNumber: 'desc' },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return {
      planVersions: plans.map((plan) => ({
        id: plan.id,
        versionNumber: plan.versionNumber,
        status: plan.status,
        revision: plan.revision,
        activePackageMode: plan.activePackageMode,
        multipleActivePackageBasis: plan.multipleActivePackageBasis,
        activationTrigger: plan.activationTrigger,
        migrationMode: plan.migrationMode,
        renewalMode: plan.renewalMode,
        upgradesEnabled: plan.upgradesEnabled,
        settlementTimezone: plan.settlementTimezone,
        effectiveFrom: plan.effectiveFrom,
        effectiveTo: plan.effectiveTo,
        publishedAt: plan.publishedAt,
        clonedFromPlanVersionId: plan.clonedFromPlanVersionId,
        createdByUserId: plan.createdByUserId,
        updatedByUserId: plan.updatedByUserId,
        publishedByUserId: plan.publishedByUserId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        itemCount: plan._count.items,
      })),
    };
  }

  async getPlanVersion(planVersionId: string) {
    const plan = await this.findPlanOrThrow(this.prisma, planVersionId);

    return { plan: toPlanSnapshot(plan) };
  }

  async createDraft(
    dto: CreatePackagePlanDraftDto,
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

      const source = await this.findPlanOrThrow(
        transaction,
        dto.sourcePlanVersionId,
      );

      if (source.status !== 'PUBLISHED') {
        throw new BadRequestException(
          'A new draft must be cloned from a published plan version.',
        );
      }

      const latest = await transaction.packagePlanVersion.findFirst({
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });

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
            'Administrator cloned a published package plan into a new draft.',
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

  async updatePlanVersion(
    planVersionId: string,
    dto: UpdatePackagePlanDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const plan = await this.findPlanOrThrow(transaction, planVersionId);
      const changedFields = this.planUpdateFields(dto);

      if (changedFields.length === 0) {
        throw new BadRequestException(
          'At least one package-plan setting must be supplied.',
        );
      }

      if (plan.revision !== dto.expectedRevision) {
        this.throwRevisionConflict(plan.revision);
      }

      if (plan.status === 'PUBLISHED') {
        return this.updatePublishedPlanClosure(
          transaction,
          plan,
          dto,
          actor,
          context,
        );
      }

      if (dto.effectiveTo !== undefined) {
        throw new BadRequestException(
          'Draft effective dates are set atomically during publication.',
        );
      }

      if (dto.settlementTimezone !== undefined) {
        assertValidTimezone(dto.settlementTimezone);
      }

      const before = toPlanSnapshot(plan);
      const updatedCount = await transaction.packagePlanVersion.updateMany({
        where: {
          id: plan.id,
          status: 'DRAFT',
          revision: dto.expectedRevision,
        },
        data: {
          activePackageMode: dto.activePackageMode,
          multipleActivePackageBasis: dto.multipleActivePackageBasis,
          activationTrigger: dto.activationTrigger,
          migrationMode: dto.migrationMode,
          renewalMode: dto.renewalMode,
          upgradesEnabled: dto.upgradesEnabled,
          settlementTimezone: dto.settlementTimezone,
          updatedByUserId: actor.id,
          revision: { increment: 1 },
        },
      });

      if (updatedCount.count !== 1) {
        this.throwRevisionConflict();
      }

      const updated = await this.findPlanOrThrow(transaction, plan.id);
      const after = toPlanSnapshot(updated);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'PackagePlanVersion',
          entityId: plan.id,
          description: 'Administrator updated package-plan draft settings.',
          metadata: {
            source: 'ADMIN_PACKAGE_PLAN',
            operation: 'UPDATE_DRAFT',
            reason: dto.reason,
            changedFields,
            revision: updated.revision,
            before,
            after,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: `Package plan V${updated.versionNumber} draft updated.`,
        plan: after,
      };
    });
  }

  async createPlanItem(
    planVersionId: string,
    dto: CreatePackagePlanItemDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const plan = await this.findPlanOrThrow(transaction, planVersionId);
      this.assertEditableDraft(plan, dto.expectedRevision);

      const definition = await transaction.packageDefinition.findUnique({
        where: { code: dto.packageCode },
      });

      if (!definition) {
        throw new NotFoundException('Package definition was not found.');
      }

      if (
        plan.items.some((item) => item.packageDefinitionId === definition.id)
      ) {
        throw new ConflictException(
          'This package definition already exists in the draft.',
        );
      }

      if (plan.items.some((item) => item.slug === dto.slug)) {
        throw new ConflictException(
          'This package slug already exists in the draft.',
        );
      }

      if (plan.items.some((item) => item.sortOrder === dto.sortOrder)) {
        throw new ConflictException(
          'This package sort order already exists in the draft.',
        );
      }

      const terms = createDtoTerms(dto);
      const decimalTerms = validateAndConvertItemTerms(terms);

      await this.bumpDraftRevision(
        transaction,
        plan.id,
        dto.expectedRevision,
        actor.id,
      );

      const item = await transaction.packagePlanItem.create({
        data: {
          planVersionId: plan.id,
          packageDefinitionId: definition.id,
          ...terms,
          ...decimalTerms,
        },
        include: { packageDefinition: true },
      });

      const after = toItemSnapshot(item);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'PackagePlanItem',
          entityId: item.id,
          description: 'Administrator added an item to a package-plan draft.',
          metadata: {
            source: 'ADMIN_PACKAGE_PLAN',
            operation: 'CREATE_DRAFT_ITEM',
            reason: dto.reason,
            planVersionId: plan.id,
            revision: dto.expectedRevision + 1,
            before: null,
            after,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'Package-plan item created.',
        revision: dto.expectedRevision + 1,
        item: after,
      };
    });
  }

  async updatePlanItem(
    planVersionId: string,
    itemId: string,
    dto: UpdatePackagePlanItemDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const plan = await this.findPlanOrThrow(transaction, planVersionId);
      this.assertEditableDraft(plan, dto.expectedRevision);

      const item = plan.items.find((candidate) => candidate.id === itemId);

      if (!item) {
        throw new NotFoundException(
          'Package-plan item was not found in this plan version.',
        );
      }

      const changedFields = this.itemUpdateFields(dto);

      if (changedFields.length === 0) {
        throw new BadRequestException(
          'At least one package-plan item setting must be supplied.',
        );
      }

      const terms = mergeItemTerms(item, dto);
      const decimalTerms = validateAndConvertItemTerms(terms);
      const before = toItemSnapshot(item);

      if (
        plan.items.some(
          (candidate) =>
            candidate.id !== item.id && candidate.slug === terms.slug,
        )
      ) {
        throw new ConflictException(
          'This package slug already exists in the draft.',
        );
      }

      if (
        plan.items.some(
          (candidate) =>
            candidate.id !== item.id && candidate.sortOrder === terms.sortOrder,
        )
      ) {
        throw new ConflictException(
          'This package sort order already exists in the draft.',
        );
      }

      await this.bumpDraftRevision(
        transaction,
        plan.id,
        dto.expectedRevision,
        actor.id,
      );

      const updated = await transaction.packagePlanItem.update({
        where: { id: item.id },
        data: {
          ...terms,
          ...decimalTerms,
        },
        include: { packageDefinition: true },
      });

      const after = toItemSnapshot(updated);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'PackagePlanItem',
          entityId: item.id,
          description: 'Administrator updated a package-plan draft item.',
          metadata: {
            source: 'ADMIN_PACKAGE_PLAN',
            operation: 'UPDATE_DRAFT_ITEM',
            reason: dto.reason,
            changedFields,
            planVersionId: plan.id,
            revision: dto.expectedRevision + 1,
            before,
            after,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'Package-plan item updated.',
        revision: dto.expectedRevision + 1,
        item: after,
      };
    });
  }

  async publishPlanVersion(
    planVersionId: string,
    dto: PublishPackagePlanDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.runSerializable(async (transaction) => {
      const plan = await this.findPlanOrThrow(transaction, planVersionId);
      this.assertEditableDraft(plan, dto.expectedRevision);
      assertPublishablePlan(plan);

      const publishedAt = new Date();
      const effectiveFrom = dto.effectiveFrom
        ? parsePackagePlanDate(dto.effectiveFrom, 'effectiveFrom')
        : publishedAt;
      const effectiveTo = dto.effectiveTo
        ? parsePackagePlanDate(dto.effectiveTo, 'effectiveTo')
        : null;

      if (
        effectiveFrom.getTime() <
        publishedAt.getTime() + MIN_PUBLICATION_LEAD_MS
      ) {
        throw new BadRequestException(
          'effectiveFrom cannot backdate a package-plan publication.',
        );
      }

      if (effectiveTo && effectiveTo <= effectiveFrom) {
        throw new BadRequestException(
          'effectiveTo must be later than effectiveFrom.',
        );
      }

      const overlaps = await this.findPublishedOverlaps(
        transaction,
        effectiveFrom,
        effectiveTo,
      );

      const closablePredecessor =
        overlaps.length === 1 &&
        overlaps[0].effectiveTo === null &&
        overlaps[0].effectiveFrom !== null &&
        overlaps[0].effectiveFrom < effectiveFrom &&
        overlaps[0].effectiveFrom <= publishedAt
          ? overlaps[0]
          : null;

      if (overlaps.length > 0 && !closablePredecessor) {
        throw new ConflictException(
          'The requested effective range overlaps another published package plan.',
        );
      }

      if (closablePredecessor) {
        const predecessorBefore = toPlanSnapshot(closablePredecessor);

        await transaction.packagePlanVersion.update({
          where: { id: closablePredecessor.id },
          data: {
            effectiveTo: effectiveFrom,
            updatedByUserId: actor.id,
            revision: { increment: 1 },
          },
        });

        const predecessorAfter = await this.findPlanOrThrow(
          transaction,
          closablePredecessor.id,
        );

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'PackagePlanVersion',
            entityId: closablePredecessor.id,
            description:
              'SUPER_ADMIN atomically closed the predecessor package plan during publication.',
            metadata: {
              source: 'ADMIN_PACKAGE_PLAN',
              operation: 'AUTO_CLOSE_FOR_PUBLISH',
              reason: dto.reason,
              successorPlanVersionId: plan.id,
              revision: predecessorAfter.revision,
              before: predecessorBefore,
              after: toPlanSnapshot(predecessorAfter),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }

      const before = toPlanSnapshot(plan);
      const updatedCount = await transaction.packagePlanVersion.updateMany({
        where: {
          id: plan.id,
          status: 'DRAFT',
          revision: dto.expectedRevision,
        },
        data: {
          status: 'PUBLISHED',
          effectiveFrom,
          effectiveTo,
          publishedAt,
          publishedByUserId: actor.id,
          updatedByUserId: actor.id,
          revision: { increment: 1 },
        },
      });

      if (updatedCount.count !== 1) {
        this.throwRevisionConflict();
      }

      const published = await this.findPlanOrThrow(transaction, plan.id);
      const after = toPlanSnapshot(published);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'APPROVE',
          entityType: 'PackagePlanVersion',
          entityId: plan.id,
          description: 'SUPER_ADMIN published a package plan atomically.',
          metadata: {
            source: 'ADMIN_PACKAGE_PLAN',
            operation: 'PUBLISH',
            reason: dto.reason,
            revision: published.revision,
            before,
            after,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: `Package plan V${published.versionNumber} published.`,
        plan: after,
      };
    });
  }

  private async updatePublishedPlanClosure(
    transaction: Prisma.TransactionClient,
    plan: PlanWithItems,
    dto: UpdatePackagePlanDto,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    this.assertSuperAdmin(actor);

    const changedFields = this.planUpdateFields(dto);

    if (changedFields.length !== 1 || changedFields[0] !== 'effectiveTo') {
      throw new BadRequestException(
        'Published commercial terms are immutable; only a future effectiveTo closure may change.',
      );
    }

    if (!dto.effectiveTo) {
      throw new BadRequestException(
        'A published plan closure requires a finite effectiveTo timestamp.',
      );
    }

    const now = new Date();
    const effectiveTo = parsePackagePlanDate(dto.effectiveTo, 'effectiveTo');

    if (!plan.effectiveFrom || effectiveTo <= plan.effectiveFrom) {
      throw new BadRequestException(
        'effectiveTo must be later than the published effectiveFrom.',
      );
    }

    if (effectiveTo <= now) {
      throw new BadRequestException(
        'Published package plans cannot be closed retroactively.',
      );
    }

    if (plan.effectiveTo && plan.effectiveTo <= now) {
      throw new ConflictException(
        'An ended package plan cannot be changed retroactively.',
      );
    }

    const overlaps = await this.findPublishedOverlaps(
      transaction,
      plan.effectiveFrom,
      effectiveTo,
      plan.id,
    );

    if (overlaps.length > 0) {
      throw new ConflictException(
        'The requested closure range overlaps another published package plan.',
      );
    }

    const before = toPlanSnapshot(plan);
    const updatedCount = await transaction.packagePlanVersion.updateMany({
      where: {
        id: plan.id,
        status: 'PUBLISHED',
        revision: dto.expectedRevision,
      },
      data: {
        effectiveTo,
        updatedByUserId: actor.id,
        revision: { increment: 1 },
      },
    });

    if (updatedCount.count !== 1) {
      this.throwRevisionConflict();
    }

    const updated = await this.findPlanOrThrow(transaction, plan.id);
    const after = toPlanSnapshot(updated);

    await transaction.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'UPDATE',
        entityType: 'PackagePlanVersion',
        entityId: plan.id,
        description:
          'SUPER_ADMIN changed a published package-plan closure time.',
        metadata: {
          source: 'ADMIN_PACKAGE_PLAN',
          operation: 'CLOSE_PUBLISHED_PLAN',
          reason: dto.reason,
          revision: updated.revision,
          before,
          after,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      message: `Package plan V${updated.versionNumber} closure updated.`,
      plan: after,
    };
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

  private findPublishedOverlaps(
    transaction: Prisma.TransactionClient,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludePlanVersionId?: string,
  ) {
    return transaction.packagePlanVersion.findMany({
      where: {
        id: excludePlanVersionId ? { not: excludePlanVersionId } : undefined,
        status: 'PUBLISHED',
        effectiveFrom: effectiveTo ? { lt: effectiveTo } : { not: null },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
      include: PLAN_INCLUDE,
      orderBy: { effectiveFrom: 'asc' },
    });
  }

  private async bumpDraftRevision(
    transaction: Prisma.TransactionClient,
    planVersionId: string,
    expectedRevision: number,
    actorUserId: string,
  ) {
    const result = await transaction.packagePlanVersion.updateMany({
      where: {
        id: planVersionId,
        status: 'DRAFT',
        revision: expectedRevision,
      },
      data: {
        revision: { increment: 1 },
        updatedByUserId: actorUserId,
      },
    });

    if (result.count !== 1) {
      this.throwRevisionConflict();
    }
  }

  private assertEditableDraft(plan: PlanWithItems, expectedRevision: number) {
    if (plan.status !== 'DRAFT') {
      throw new ConflictException(
        'Published package-plan terms are immutable; clone a new draft.',
      );
    }

    if (plan.revision !== expectedRevision) {
      this.throwRevisionConflict(plan.revision);
    }
  }

  private planUpdateFields(dto: UpdatePackagePlanDto) {
    return Object.keys(dto).filter(
      (key) => key !== 'expectedRevision' && key !== 'reason',
    );
  }

  private itemUpdateFields(dto: UpdatePackagePlanItemDto) {
    return Object.keys(dto).filter(
      (key) => key !== 'expectedRevision' && key !== 'reason',
    );
  }

  private async findPlanOrThrow(
    client:
      Pick<PrismaService, 'packagePlanVersion'> | Prisma.TransactionClient,
    planVersionId: string,
  ) {
    const plan = await client.packagePlanVersion.findUnique({
      where: { id: planVersionId },
      include: PLAN_INCLUDE,
    });

    if (!plan) {
      throw new NotFoundException('Package plan version was not found.');
    }

    return plan;
  }

  private assertSuperAdmin(actor: AuthenticatedUser) {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }

  private throwRevisionConflict(currentRevision?: number): never {
    throw new ConflictException(
      currentRevision
        ? `Package plan revision is stale. Current revision is ${currentRevision}.`
        : 'Package plan revision is stale; reload the plan and retry.',
    );
  }
}
