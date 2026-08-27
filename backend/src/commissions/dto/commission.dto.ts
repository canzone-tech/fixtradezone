import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';
import {
  COMMISSION_COMPRESSION_MODES,
  COMMISSION_EVENT_STATUSES,
  COMMISSION_RELEASE_MODES,
  COMMISSION_UPGRADE_BASE_MODES,
  INACTIVE_UPLINE_ACTIONS,
  type CommissionCompressionMode,
  type CommissionEventStatus,
  type CommissionReleaseMode,
  type CommissionUpgradeBaseMode,
  type InactiveUplineAction,
} from '../commissions.constants';

const RATE_PATTERN =
  /^(?!0(?:\.0{1,6})?$)(?:100(?:\.0{1,6})?|(?:[1-9]\d?|0)(?:\.\d{1,6})?)$/;

export class CommissionPageQueryDto {
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

export class AdminCommissionQueryDto extends CommissionPageQueryDto {
  @IsOptional()
  @IsUUID()
  receiverUserId?: string;

  @IsOptional()
  @IsUUID()
  purchaserUserId?: string;

  @IsOptional()
  @IsIn(COMMISSION_EVENT_STATUSES)
  status?: CommissionEventStatus;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @Length(1, 10)
  currency?: string;
}

export class CommissionLevelRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  level!: number;

  @IsBoolean()
  enabled!: boolean;

  @Transform(trimString)
  @IsString()
  @Matches(RATE_PATTERN)
  ratePercent!: string;

  @IsBoolean()
  packageMatchingEnabled!: boolean;
}

class AuditedCommissionRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateCommissionPlanDraftDto {
  @Transform(trimString)
  @IsString()
  @IsUUID()
  sourcePlanVersionId!: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateCommissionPlanDto extends AuditedCommissionRevisionDto {
  @IsOptional()
  @IsBoolean()
  firstPurchaseEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  newPurchaseEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  renewalEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  upgradeEnabled?: boolean;

  @IsOptional()
  @IsIn(COMMISSION_UPGRADE_BASE_MODES)
  upgradeBaseMode?: CommissionUpgradeBaseMode;

  @IsOptional()
  @IsBoolean()
  activePackageRequired?: boolean;

  @IsOptional()
  @IsIn(INACTIVE_UPLINE_ACTIONS)
  inactiveUplineAction?: InactiveUplineAction;

  @IsOptional()
  @IsIn(COMMISSION_COMPRESSION_MODES)
  compressionMode?: CommissionCompressionMode;

  @IsOptional()
  @IsIn(COMMISSION_RELEASE_MODES)
  releaseMode?: CommissionReleaseMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8760)
  holdPeriodHours?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CommissionLevelRuleDto)
  levels?: CommissionLevelRuleDto[];
}

export class PublishCommissionPlanDto extends AuditedCommissionRevisionDto {
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
