import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { itemTerms } from './package-plan.mapper';
import { PACKAGE_CURRENCY } from './packages.constants';
import type { ItemTerms, PlanWithItems } from './packages.types';

export function assertPublishablePlan(plan: PlanWithItems) {
  if (plan.items.length === 0) {
    throw new BadRequestException(
      'A package plan must contain at least one item before publication.',
    );
  }

  assertValidTimezone(plan.settlementTimezone);

  if (plan.upgradesEnabled) {
    throw new BadRequestException(
      'Package upgrades remain disabled until subscription, payment and ledger support exists.',
    );
  }

  if (plan.renewalMode !== 'MANUAL_AFTER_TERMINAL') {
    throw new BadRequestException(
      'The approved renewal contract is MANUAL_AFTER_TERMINAL.',
    );
  }

  if (
    plan.activePackageMode === 'MULTIPLE_ACTIVE' &&
    plan.multipleActivePackageBasis !== 'HIGHEST_ACTIVE_PACKAGE'
  ) {
    throw new BadRequestException(
      'The approved initial MULTIPLE_ACTIVE basis is HIGHEST_ACTIVE_PACKAGE.',
    );
  }

  for (const item of plan.items) {
    validateAndConvertItemTerms(itemTerms(item));

    if (item.currency !== PACKAGE_CURRENCY) {
      throw new BadRequestException(
        `${item.packageDefinition.code} must be denominated in USDT.`,
      );
    }

    if (item.rewardRateMeaning !== 'USER_NET_AFTER_SPLIT') {
      throw new BadRequestException(
        `${item.packageDefinition.code} must publish a USER_NET_AFTER_SPLIT rate.`,
      );
    }

    if (item.minimumInvestment == null) {
      if (
        item.capBasis !== 'TOTAL_RETURN' ||
        item.principalTreatment !== 'INCLUDED_IN_TOTAL_RETURN'
      ) {
        throw new BadRequestException(
          `${item.packageDefinition.code} legacy fixed-price terms must use TOTAL_RETURN with INCLUDED_IN_TOTAL_RETURN.`,
        );
      }
    } else {
      if (item.durationDays == null) {
        throw new BadRequestException(
          `${item.packageDefinition.code} range terms require durationDays.`,
        );
      }

      if (!item.price.equals(item.minimumInvestment)) {
        throw new BadRequestException(
          `${item.packageDefinition.code} range terms must keep compatibility price equal to minimumInvestment.`,
        );
      }

      if (
        item.goalDays !== item.durationDays ||
        item.cycleDays !== item.durationDays ||
        item.cycleEndAction !== 'COMPLETE_PACKAGE'
      ) {
        throw new BadRequestException(
          `${item.packageDefinition.code} range lifecycle must complete at its configured duration.`,
        );
      }

      if (
        item.principalTreatment !== 'RETURN_SEPARATELY' &&
        item.principalTreatment !== 'NON_REFUNDABLE_PACKAGE_VALUE'
      ) {
        throw new BadRequestException(
          `${item.packageDefinition.code} range lifecycle must explicitly define capital return or no capital return.`,
        );
      }
    }

    if (item.capReachedAction === 'AUTO_RENEW') {
      throw new BadRequestException(
        `${item.packageDefinition.code} cannot auto-renew under the approved renewal contract.`,
      );
    }
  }
}

export function validateAndConvertItemTerms(terms: ItemTerms) {
  const price = decimal(terms.price, 'price');
  const minimumInvestment = nullableDecimal(
    terms.minimumInvestment,
    'minimumInvestment',
  );
  const maximumInvestment = nullableDecimal(
    terms.maximumInvestment,
    'maximumInvestment',
  );
  const capMultiplier = decimal(terms.capMultiplier, 'capMultiplier');
  const fixedRewardRate = nullableDecimal(
    terms.fixedRewardRate,
    'fixedRewardRate',
  );
  const minimumRewardRate = nullableDecimal(
    terms.minimumRewardRate,
    'minimumRewardRate',
  );
  const maximumRewardRate = nullableDecimal(
    terms.maximumRewardRate,
    'maximumRewardRate',
  );

  if (!price.gt(0)) {
    throw new BadRequestException('Package price must be greater than zero.');
  }

  const rangeConfigured =
    minimumInvestment !== null || terms.durationDays != null;

  if (rangeConfigured) {
    if (minimumInvestment === null || terms.durationDays == null) {
      throw new BadRequestException(
        'Range packages require minimumInvestment and durationDays together.',
      );
    }

    if (!minimumInvestment.gt(0)) {
      throw new BadRequestException(
        'minimumInvestment must be greater than zero.',
      );
    }

    if (maximumInvestment && maximumInvestment.lt(minimumInvestment)) {
      throw new BadRequestException(
        'maximumInvestment cannot be less than minimumInvestment.',
      );
    }

    if (terms.durationDays < 1) {
      throw new BadRequestException('durationDays must be at least 1.');
    }

    if (!price.equals(minimumInvestment)) {
      throw new BadRequestException(
        'Range packages must keep compatibility price equal to minimumInvestment.',
      );
    }
  } else if (maximumInvestment !== null) {
    throw new BadRequestException(
      'maximumInvestment cannot be configured without minimumInvestment.',
    );
  }

  if (!capMultiplier.gt(0)) {
    throw new BadRequestException(
      'Package cap multiplier must be greater than zero.',
    );
  }

  if (
    terms.capBasis === 'TOTAL_RETURN' &&
    terms.principalTreatment === 'INCLUDED_IN_TOTAL_RETURN' &&
    capMultiplier.lt(1)
  ) {
    throw new BadRequestException(
      'TOTAL_RETURN with included principal requires a cap multiplier of at least 1.',
    );
  }

  if (terms.currency !== PACKAGE_CURRENCY) {
    throw new BadRequestException('Package currency must be USDT.');
  }

  if (terms.cycleDays > terms.goalDays) {
    throw new BadRequestException(
      'Package cycleDays cannot exceed package goalDays.',
    );
  }

  if (terms.rewardRateMode === 'FIXED') {
    if (
      fixedRewardRate === null ||
      minimumRewardRate !== null ||
      maximumRewardRate !== null
    ) {
      throw new BadRequestException(
        'FIXED rate mode requires fixedRewardRate and no range values.',
      );
    }

    assertValidPercentage(fixedRewardRate, 'fixedRewardRate');
  } else {
    if (
      fixedRewardRate !== null ||
      minimumRewardRate === null ||
      maximumRewardRate === null
    ) {
      throw new BadRequestException(
        `${terms.rewardRateMode} rate mode requires minimumRewardRate and maximumRewardRate, with no fixedRewardRate.`,
      );
    }

    assertValidPercentage(minimumRewardRate, 'minimumRewardRate');
    assertValidPercentage(maximumRewardRate, 'maximumRewardRate');

    if (minimumRewardRate.gt(maximumRewardRate)) {
      throw new BadRequestException(
        'minimumRewardRate cannot exceed maximumRewardRate.',
      );
    }
  }

  return {
    price,
    minimumInvestment,
    maximumInvestment,
    durationDays: terms.durationDays ?? null,
    capMultiplier,
    fixedRewardRate,
    minimumRewardRate,
    maximumRewardRate,
  };
}

export function parsePackagePlanDate(value: string, field: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO timestamp.`);
  }

  return parsed;
}

export function assertValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException(
      'settlementTimezone must be a valid IANA timezone.',
    );
  }
}

function assertValidPercentage(value: Prisma.Decimal, field: string) {
  if (!value.gt(0) || value.gt(100)) {
    throw new BadRequestException(
      `${field} must be greater than zero and no more than 100 percentage points.`,
    );
  }
}

function decimal(value: string, field: string) {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new BadRequestException(`${field} must be a valid decimal string.`);
  }
}

function nullableDecimal(value: string | null, field: string) {
  return value === null ? null : decimal(value, field);
}
