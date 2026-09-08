import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

const RATE_DECIMAL_PLACES = 6;
const MONEY_DECIMAL_PLACES = 8;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMAL_PLACES);
const MONEY_QUANTUM = new Prisma.Decimal('0.00000001');

type DecimalValue = Prisma.Decimal | string | number;

export interface PackageUserNetRateTerms {
  rewardRateMode: 'FIXED' | 'RANDOM_RANGE' | 'MANUAL' | 'RULE_BASED';
  fixedRewardRate: DecimalValue | null;
  minimumRewardRate: DecimalValue | null;
  maximumRewardRate: DecimalValue | null;
  rewardRateMeaning: string;
}

export interface PackageLifetimeTargetInput extends PackageUserNetRateTerms {
  subscriptionId: string;
  principalAmount: DecimalValue;
  userSharePercent: DecimalValue;
  activationLocalDate: string;
  earningDays: number;
}

export function packageUserNetRateForDate(
  subscriptionId: string,
  localDate: string,
  terms: PackageUserNetRateTerms,
): Prisma.Decimal {
  assertUserNetTerms(terms);

  if (terms.rewardRateMode === 'FIXED') {
    if (terms.fixedRewardRate === null) {
      throw new BadRequestException(
        'FIXED package earning terms require fixedRewardRate.',
      );
    }

    return validRate(terms.fixedRewardRate, 'fixedRewardRate');
  }

  if (terms.rewardRateMode !== 'RANDOM_RANGE') {
    throw new BadRequestException(
      `Internal trading requires FIXED or RANDOM_RANGE USER net package rates, not ${terms.rewardRateMode}.`,
    );
  }

  if (terms.minimumRewardRate === null || terms.maximumRewardRate === null) {
    throw new BadRequestException(
      'RANDOM_RANGE package earning terms require minimumRewardRate and maximumRewardRate.',
    );
  }

  const minimum = rateToScaledInteger(
    validRate(terms.minimumRewardRate, 'minimumRewardRate'),
  );
  const maximum = rateToScaledInteger(
    validRate(terms.maximumRewardRate, 'maximumRewardRate'),
  );

  if (maximum < minimum) {
    throw new BadRequestException(
      'minimumRewardRate cannot exceed maximumRewardRate.',
    );
  }

  const span = maximum - minimum + 1n;
  const digest = createHash('sha256')
    .update(`PACKAGE_USER_NET_RATE:${subscriptionId}:${localDate}`)
    .digest();
  const selected = minimum + (digest.readBigUInt64BE(0) % span);

  return new Prisma.Decimal(selected.toString()).div(RATE_SCALE.toString());
}

export function packageUserNetAmount(
  principalAmount: DecimalValue,
  userNetRatePercent: DecimalValue,
): Prisma.Decimal {
  const principal = money(principalAmount);
  const rate = validRate(userNetRatePercent, 'userNetRatePercent');

  if (principal.lte(0)) {
    throw new BadRequestException(
      'Package principal must be greater than zero.',
    );
  }

  return money(principal.mul(rate).div(100));
}

export function grossTargetForUserNet(
  userNetTarget: DecimalValue,
  userSharePercent: DecimalValue,
): Prisma.Decimal {
  const target = money(userNetTarget);
  const share = validShare(userSharePercent);

  if (target.lt(0)) {
    throw new BadRequestException('USER net target cannot be negative.');
  }

  if (target.eq(0)) {
    return new Prisma.Decimal(0).toDecimalPlaces(MONEY_DECIMAL_PLACES);
  }

  const raw = target.mul(100).div(share);
  let candidate = raw.toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_HALF_UP,
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const credited = money(candidate.mul(share).div(100));
    if (credited.eq(target)) {
      return candidate;
    }

    candidate = credited.lt(target)
      ? candidate.add(MONEY_QUANTUM)
      : candidate.sub(MONEY_QUANTUM);
  }

  throw new BadRequestException(
    'Unable to resolve exact gross target for USER net package earning.',
  );
}

export function derivePackageLifetimeTarget(input: PackageLifetimeTargetInput) {
  if (!Number.isInteger(input.earningDays) || input.earningDays < 1) {
    throw new BadRequestException('Package earningDays must be at least 1.');
  }

  const principal = money(input.principalAmount);
  if (principal.lte(0)) {
    throw new BadRequestException(
      'Package principal must be greater than zero.',
    );
  }

  let userNetTarget = new Prisma.Decimal(0);

  for (let dayNumber = 1; dayNumber <= input.earningDays; dayNumber += 1) {
    const localDate = addLocalDays(input.activationLocalDate, dayNumber);
    const rate = packageUserNetRateForDate(
      input.subscriptionId,
      localDate,
      input,
    );
    userNetTarget = userNetTarget.add(packageUserNetAmount(principal, rate));
  }

  userNetTarget = money(userNetTarget);
  const grossTarget = grossTargetForUserNet(
    userNetTarget,
    input.userSharePercent,
  );

  return {
    firstEarningLocalDate: addLocalDays(input.activationLocalDate, 1),
    finalEarningLocalDate: addLocalDays(
      input.activationLocalDate,
      input.earningDays,
    ),
    userNetTarget,
    grossTarget,
    grossMultiplier: grossTarget
      .div(principal)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
  };
}

export function addLocalDays(localDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new BadRequestException('Local date must be YYYY-MM-DD.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

function assertUserNetTerms(terms: PackageUserNetRateTerms): void {
  if (terms.rewardRateMeaning !== 'USER_NET_AFTER_SPLIT') {
    throw new BadRequestException(
      'Internal trading package rate must mean USER_NET_AFTER_SPLIT.',
    );
  }
}

function validRate(value: DecimalValue, field: string): Prisma.Decimal {
  const parsed = rate(value);

  if (!parsed.gt(0) || parsed.gt(100)) {
    throw new BadRequestException(
      `${field} must be greater than zero and no more than 100 percentage points.`,
    );
  }

  return parsed;
}

function validShare(value: DecimalValue): Prisma.Decimal {
  const parsed = rate(value);

  if (!parsed.gt(0) || parsed.gt(100)) {
    throw new BadRequestException(
      'Internal trading USER share must be greater than zero and no more than 100%.',
    );
  }

  return parsed;
}

function rateToScaledInteger(value: Prisma.Decimal): bigint {
  return BigInt(value.toFixed(RATE_DECIMAL_PLACES).replace('.', ''));
}

function money(value: DecimalValue): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

function rate(value: DecimalValue): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    RATE_DECIMAL_PLACES,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}
