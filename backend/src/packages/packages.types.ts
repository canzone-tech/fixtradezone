import type { Prisma } from '../generated/prisma/client';

export const PLAN_INCLUDE = {
  items: {
    include: {
      packageDefinition: true,
    },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.PackagePlanVersionInclude;

export type PlanWithItems = Prisma.PackagePlanVersionGetPayload<{
  include: typeof PLAN_INCLUDE;
}>;

export type PlanItemWithDefinition = PlanWithItems['items'][number];

export interface ItemTerms {
  displayName: string;
  slug: string;
  sortOrder: number;
  availability: PlanItemWithDefinition['availability'];
  price: string;
  minimumInvestment: string | null;
  maximumInvestment: string | null;
  durationDays: number | null;
  currency: string;
  rewardRateMode: PlanItemWithDefinition['rewardRateMode'];
  fixedRewardRate: string | null;
  minimumRewardRate: string | null;
  maximumRewardRate: string | null;
  rewardRateMeaning: PlanItemWithDefinition['rewardRateMeaning'];
  capBasis: PlanItemWithDefinition['capBasis'];
  capMultiplier: string;
  principalTreatment: PlanItemWithDefinition['principalTreatment'];
  goalDays: number;
  cycleDays: number;
  rewardStartMode: PlanItemWithDefinition['rewardStartMode'];
  rewardFrequency: PlanItemWithDefinition['rewardFrequency'];
  cycleDayMode: PlanItemWithDefinition['cycleDayMode'];
  rewardDayMode: PlanItemWithDefinition['rewardDayMode'];
  cycleEndAction: PlanItemWithDefinition['cycleEndAction'];
  capReachedAction: PlanItemWithDefinition['capReachedAction'];
}
