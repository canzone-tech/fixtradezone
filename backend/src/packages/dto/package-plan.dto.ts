import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';
import {
  ACTIVE_PACKAGE_MODES,
  MULTIPLE_ACTIVE_PACKAGE_BASES,
  PACKAGE_ACTIVATION_TRIGGERS,
  PACKAGE_AVAILABILITIES,
  PACKAGE_CAP_BASES,
  PACKAGE_CAP_REACHED_ACTIONS,
  PACKAGE_CURRENCY,
  PACKAGE_CYCLE_DAY_MODES,
  PACKAGE_CYCLE_END_ACTIONS,
  PACKAGE_PLAN_MIGRATION_MODES,
  PACKAGE_PRINCIPAL_TREATMENTS,
  PACKAGE_RENEWAL_MODES,
  PACKAGE_REWARD_DAY_MODES,
  PACKAGE_REWARD_FREQUENCIES,
  PACKAGE_REWARD_RATE_MEANINGS,
  PACKAGE_REWARD_RATE_MODES,
  PACKAGE_REWARD_START_MODES,
  type ActivePackageMode,
  type MultipleActivePackageBasis,
  type PackageActivationTrigger,
  type PackageAvailability,
  type PackageCapBasis,
  type PackageCapReachedAction,
  type PackageCycleDayMode,
  type PackageCycleEndAction,
  type PackagePlanMigrationMode,
  type PackagePrincipalTreatment,
  type PackageRenewalMode,
  type PackageRewardDayMode,
  type PackageRewardFrequency,
  type PackageRewardRateMeaning,
  type PackageRewardRateMode,
  type PackageRewardStartMode,
} from '../packages.constants';

const PRICE_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;
const PERCENTAGE_PATTERN = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/;
const MULTIPLIER_PATTERN = /^(?:0|[1-9]\d{0,5})(?:\.\d{1,4})?$/;
const PACKAGE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class AuditedRevisionDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreatePackagePlanDraftDto {
  @Transform(trimString)
  @IsString()
  @IsUUID()
  @MaxLength(36)
  sourcePlanVersionId!: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdatePackagePlanDto extends AuditedRevisionDto {
  @IsOptional()
  @IsIn(ACTIVE_PACKAGE_MODES)
  activePackageMode?: ActivePackageMode;

  @IsOptional()
  @IsIn(MULTIPLE_ACTIVE_PACKAGE_BASES)
  multipleActivePackageBasis?: MultipleActivePackageBasis;

  @IsOptional()
  @IsIn(PACKAGE_ACTIVATION_TRIGGERS)
  activationTrigger?: PackageActivationTrigger;

  @IsOptional()
  @IsIn(PACKAGE_PLAN_MIGRATION_MODES)
  migrationMode?: PackagePlanMigrationMode;

  @IsOptional()
  @IsIn(PACKAGE_RENEWAL_MODES)
  renewalMode?: PackageRenewalMode;

  @IsOptional()
  @IsBoolean()
  upgradesEnabled?: boolean;

  @Equals(undefined, {
    message:
      'settlementTimezone is controlled by SUPER_ADMIN Platform Operations.',
  })
  settlementTimezone?: string;

  @Transform(trimString)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  effectiveTo?: string | null;
}

export class PublishPackagePlanDto extends AuditedRevisionDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  effectiveFrom?: string;

  @Transform(trimString)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  effectiveTo?: string | null;
}

export class CreatePackagePlanItemDto extends AuditedRevisionDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(PACKAGE_CODE_PATTERN)
  packageCode!: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  displayName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(100)
  slug!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  sortOrder!: number;

  @IsIn(PACKAGE_AVAILABILITIES)
  availability!: PackageAvailability;

  @Transform(trimString)
  @IsString()
  @Matches(PRICE_PATTERN)
  price!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PRICE_PATTERN)
  minimumInvestment?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PRICE_PATTERN)
  maximumInvestment?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36500)
  durationDays?: number | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsIn([PACKAGE_CURRENCY])
  currency!: typeof PACKAGE_CURRENCY;

  @IsIn(PACKAGE_REWARD_RATE_MODES)
  rewardRateMode!: PackageRewardRateMode;

  @Transform(trimString)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  fixedRewardRate?: string | null;

  @Transform(trimString)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  minimumRewardRate?: string | null;

  @Transform(trimString)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  maximumRewardRate?: string | null;

  @IsIn(PACKAGE_REWARD_RATE_MEANINGS)
  rewardRateMeaning!: PackageRewardRateMeaning;

  @IsIn(PACKAGE_CAP_BASES)
  capBasis!: PackageCapBasis;

  @Transform(trimString)
  @IsString()
  @Matches(MULTIPLIER_PATTERN)
  capMultiplier!: string;

  @IsIn(PACKAGE_PRINCIPAL_TREATMENTS)
  principalTreatment!: PackagePrincipalTreatment;

  @IsInt()
  @Min(1)
  @Max(36500)
  goalDays!: number;

  @IsInt()
  @Min(1)
  @Max(36500)
  cycleDays!: number;

  @IsIn(PACKAGE_REWARD_START_MODES)
  rewardStartMode!: PackageRewardStartMode;

  @IsIn(PACKAGE_REWARD_FREQUENCIES)
  rewardFrequency!: PackageRewardFrequency;

  @IsIn(PACKAGE_CYCLE_DAY_MODES)
  cycleDayMode!: PackageCycleDayMode;

  @IsIn(PACKAGE_REWARD_DAY_MODES)
  rewardDayMode!: PackageRewardDayMode;

  @IsIn(PACKAGE_CYCLE_END_ACTIONS)
  cycleEndAction!: PackageCycleEndAction;

  @IsIn(PACKAGE_CAP_REACHED_ACTIONS)
  capReachedAction!: PackageCapReachedAction;
}

export class UpdatePackagePlanItemDto extends AuditedRevisionDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString()
  @Matches(SLUG_PATTERN)
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsIn(PACKAGE_AVAILABILITIES)
  availability?: PackageAvailability;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PRICE_PATTERN)
  price?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PRICE_PATTERN)
  minimumInvestment?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PRICE_PATTERN)
  maximumInvestment?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36500)
  durationDays?: number | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @IsIn([PACKAGE_CURRENCY])
  currency?: typeof PACKAGE_CURRENCY;

  @IsOptional()
  @IsIn(PACKAGE_REWARD_RATE_MODES)
  rewardRateMode?: PackageRewardRateMode;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  fixedRewardRate?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  minimumRewardRate?: string | null;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  maximumRewardRate?: string | null;

  @IsOptional()
  @IsIn(PACKAGE_REWARD_RATE_MEANINGS)
  rewardRateMeaning?: PackageRewardRateMeaning;

  @IsOptional()
  @IsIn(PACKAGE_CAP_BASES)
  capBasis?: PackageCapBasis;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MULTIPLIER_PATTERN)
  capMultiplier?: string;

  @IsOptional()
  @IsIn(PACKAGE_PRINCIPAL_TREATMENTS)
  principalTreatment?: PackagePrincipalTreatment;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36500)
  goalDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36500)
  cycleDays?: number;

  @IsOptional()
  @IsIn(PACKAGE_REWARD_START_MODES)
  rewardStartMode?: PackageRewardStartMode;

  @IsOptional()
  @IsIn(PACKAGE_REWARD_FREQUENCIES)
  rewardFrequency?: PackageRewardFrequency;

  @IsOptional()
  @IsIn(PACKAGE_CYCLE_DAY_MODES)
  cycleDayMode?: PackageCycleDayMode;

  @IsOptional()
  @IsIn(PACKAGE_REWARD_DAY_MODES)
  rewardDayMode?: PackageRewardDayMode;

  @IsOptional()
  @IsIn(PACKAGE_CYCLE_END_ACTIONS)
  cycleEndAction?: PackageCycleEndAction;

  @IsOptional()
  @IsIn(PACKAGE_CAP_REACHED_ACTIONS)
  capReachedAction?: PackageCapReachedAction;
}
