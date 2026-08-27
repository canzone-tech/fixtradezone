import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';
import {
  EXISTING_SUBSCRIPTION_ROLLOUT_MODES,
  PACKAGE_REWARD_STATE_STATUSES,
  type ExistingSubscriptionRolloutMode,
  type PackageRewardStateStatus,
} from '../rewards.constants';

export class RewardPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class AdminRewardEventQueryDto extends RewardPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 10)
  currency?: string;
}

export class AdminRewardStateQueryDto extends RewardPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(PACKAGE_REWARD_STATE_STATUSES)
  status?: PackageRewardStateStatus;
}

class AuditedRewardPolicyRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateRewardPolicyDraftDto {
  @Transform(trimString)
  @IsString()
  @IsUUID()
  sourcePolicyVersionId!: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateRewardPolicyDto extends AuditedRewardPolicyRevisionDto {
  @IsOptional()
  @IsIn(EXISTING_SUBSCRIPTION_ROLLOUT_MODES)
  existingSubscriptionRolloutMode?: ExistingSubscriptionRolloutMode;

  @IsOptional()
  @IsBoolean()
  packageRewardCountsTowardCap?: boolean;

  @IsOptional()
  @IsBoolean()
  referralCommissionCountsTowardCap?: boolean;

  @IsOptional()
  @IsBoolean()
  teamCommissionCountsTowardCap?: boolean;

  @IsOptional()
  @IsBoolean()
  awardRewardCountsTowardCap?: boolean;

  @IsOptional()
  @IsBoolean()
  otherIncomeCountsTowardCap?: boolean;
}

export class PublishRewardPolicyDto extends AuditedRewardPolicyRevisionDto {
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
