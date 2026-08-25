import type {
  CreatePackagePlanItemDto,
  UpdatePackagePlanItemDto,
} from './dto/package-plan.dto';
import type {
  ItemTerms,
  PlanItemWithDefinition,
  PlanWithItems,
} from './packages.types';

export function createDtoTerms(dto: CreatePackagePlanItemDto): ItemTerms {
  return {
    displayName: dto.displayName,
    slug: dto.slug,
    sortOrder: dto.sortOrder,
    availability: dto.availability,
    price: dto.price,
    currency: dto.currency,
    rewardRateMode: dto.rewardRateMode,
    fixedRewardRate: dto.fixedRewardRate ?? null,
    minimumRewardRate: dto.minimumRewardRate ?? null,
    maximumRewardRate: dto.maximumRewardRate ?? null,
    rewardRateMeaning: dto.rewardRateMeaning,
    capBasis: dto.capBasis,
    capMultiplier: dto.capMultiplier,
    principalTreatment: dto.principalTreatment,
    goalDays: dto.goalDays,
    cycleDays: dto.cycleDays,
    rewardStartMode: dto.rewardStartMode,
    rewardFrequency: dto.rewardFrequency,
    cycleDayMode: dto.cycleDayMode,
    rewardDayMode: dto.rewardDayMode,
    cycleEndAction: dto.cycleEndAction,
    capReachedAction: dto.capReachedAction,
  };
}

export function itemTerms(item: PlanItemWithDefinition): ItemTerms {
  return {
    displayName: item.displayName,
    slug: item.slug,
    sortOrder: item.sortOrder,
    availability: item.availability,
    price: item.price.toFixed(8),
    currency: item.currency,
    rewardRateMode: item.rewardRateMode,
    fixedRewardRate: item.fixedRewardRate?.toFixed(6) ?? null,
    minimumRewardRate: item.minimumRewardRate?.toFixed(6) ?? null,
    maximumRewardRate: item.maximumRewardRate?.toFixed(6) ?? null,
    rewardRateMeaning: item.rewardRateMeaning,
    capBasis: item.capBasis,
    capMultiplier: item.capMultiplier.toFixed(4),
    principalTreatment: item.principalTreatment,
    goalDays: item.goalDays,
    cycleDays: item.cycleDays,
    rewardStartMode: item.rewardStartMode,
    rewardFrequency: item.rewardFrequency,
    cycleDayMode: item.cycleDayMode,
    rewardDayMode: item.rewardDayMode,
    cycleEndAction: item.cycleEndAction,
    capReachedAction: item.capReachedAction,
  };
}

export function mergeItemTerms(
  item: PlanItemWithDefinition,
  dto: UpdatePackagePlanItemDto,
): ItemTerms {
  const current = itemTerms(item);

  return {
    displayName: dto.displayName ?? current.displayName,
    slug: dto.slug ?? current.slug,
    sortOrder: dto.sortOrder ?? current.sortOrder,
    availability: dto.availability ?? current.availability,
    price: dto.price ?? current.price,
    currency: dto.currency ?? current.currency,
    rewardRateMode: dto.rewardRateMode ?? current.rewardRateMode,
    fixedRewardRate:
      dto.fixedRewardRate === undefined
        ? current.fixedRewardRate
        : dto.fixedRewardRate,
    minimumRewardRate:
      dto.minimumRewardRate === undefined
        ? current.minimumRewardRate
        : dto.minimumRewardRate,
    maximumRewardRate:
      dto.maximumRewardRate === undefined
        ? current.maximumRewardRate
        : dto.maximumRewardRate,
    rewardRateMeaning: dto.rewardRateMeaning ?? current.rewardRateMeaning,
    capBasis: dto.capBasis ?? current.capBasis,
    capMultiplier: dto.capMultiplier ?? current.capMultiplier,
    principalTreatment: dto.principalTreatment ?? current.principalTreatment,
    goalDays: dto.goalDays ?? current.goalDays,
    cycleDays: dto.cycleDays ?? current.cycleDays,
    rewardStartMode: dto.rewardStartMode ?? current.rewardStartMode,
    rewardFrequency: dto.rewardFrequency ?? current.rewardFrequency,
    cycleDayMode: dto.cycleDayMode ?? current.cycleDayMode,
    rewardDayMode: dto.rewardDayMode ?? current.rewardDayMode,
    cycleEndAction: dto.cycleEndAction ?? current.cycleEndAction,
    capReachedAction: dto.capReachedAction ?? current.capReachedAction,
  };
}

export function toPublicPlanSnapshot(plan: PlanWithItems) {
  return {
    id: plan.id,
    versionNumber: plan.versionNumber,
    activePackageMode: plan.activePackageMode,
    multipleActivePackageBasis: plan.multipleActivePackageBasis,
    activationTrigger: plan.activationTrigger,
    migrationMode: plan.migrationMode,
    renewalMode: plan.renewalMode,
    upgradesEnabled: plan.upgradesEnabled,
    settlementTimezone: plan.settlementTimezone,
    effectiveFrom: iso(plan.effectiveFrom),
    effectiveTo: iso(plan.effectiveTo),
  };
}

export function toPlanSnapshot(plan: PlanWithItems) {
  return {
    ...toPublicPlanSnapshot(plan),
    status: plan.status,
    revision: plan.revision,
    publishedAt: iso(plan.publishedAt),
    clonedFromPlanVersionId: plan.clonedFromPlanVersionId,
    createdByUserId: plan.createdByUserId,
    updatedByUserId: plan.updatedByUserId,
    publishedByUserId: plan.publishedByUserId,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    items: plan.items.map((item) => toItemSnapshot(item)),
  };
}

export function toItemSnapshot(item: PlanItemWithDefinition) {
  const capAmount = item.price.mul(item.capMultiplier);
  const maximumProfit =
    item.capBasis === 'TOTAL_RETURN' &&
    item.principalTreatment === 'INCLUDED_IN_TOTAL_RETURN'
      ? capAmount.minus(item.price)
      : capAmount;
  const maximumTotalReturn =
    item.capBasis === 'PROFIT_ONLY' &&
    item.principalTreatment === 'RETURN_SEPARATELY'
      ? capAmount.plus(item.price)
      : capAmount;

  return {
    id: item.id,
    packageDefinitionId: item.packageDefinitionId,
    packageCode: item.packageDefinition.code,
    displayName: item.displayName,
    slug: item.slug,
    sortOrder: item.sortOrder,
    availability: item.availability,
    price: item.price.toFixed(8),
    currency: item.currency,
    rewardRateMode: item.rewardRateMode,
    fixedRewardRate: item.fixedRewardRate?.toFixed(6) ?? null,
    minimumRewardRate: item.minimumRewardRate?.toFixed(6) ?? null,
    maximumRewardRate: item.maximumRewardRate?.toFixed(6) ?? null,
    rewardRateMeaning: item.rewardRateMeaning,
    capBasis: item.capBasis,
    capMultiplier: item.capMultiplier.toFixed(4),
    principalTreatment: item.principalTreatment,
    maximumTotalReturn: maximumTotalReturn.toFixed(8),
    maximumProfit: maximumProfit.toFixed(8),
    goalDays: item.goalDays,
    cycleDays: item.cycleDays,
    rewardStartMode: item.rewardStartMode,
    rewardFrequency: item.rewardFrequency,
    cycleDayMode: item.cycleDayMode,
    rewardDayMode: item.rewardDayMode,
    cycleEndAction: item.cycleEndAction,
    capReachedAction: item.capReachedAction,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
