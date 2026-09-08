import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { AWARD_USER_TRACK_STATUSES, type AwardUserTrackStatus } from '../award-rewards.constants';

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;
const POSITIVE_MONEY_PATTERN = /^(?:0*[1-9]\d{0,11})(?:\.\d{1,8})?$|^(?:0|[1-9]\d{0,11})\.\d*[1-9]\d*$/;

export class AwardRewardPageQueryDto {
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

export class AdminAwardRewardTrackQueryDto extends AwardRewardPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  status?: AwardUserTrackStatus;
}

export class AdminAwardRewardEventQueryDto extends AwardRewardPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}

class AuditedAwardPolicyRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateAwardRewardPolicyDraftDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @IsUUID()
  sourcePolicyVersionId?: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class AwardRewardLevelInputDto {
  @Transform(trimString)
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @Matches(MONEY_PATTERN)
  requiredBusiness!: string | null;
}

export class AwardRewardTrackInputDto {
  @IsUUID()
  packageDefinitionId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  trackOrder!: number;

  @Transform(trimString)
  @IsString()
  @Matches(POSITIVE_MONEY_PATTERN)
  awardAmount!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AwardRewardLevelInputDto)
  levels!: AwardRewardLevelInputDto[];
}

export class UpdateAwardRewardPolicyDto extends AuditedAwardPolicyRevisionDto {
  @IsBoolean()
  enabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  levelCount!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 10)
  asset!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardRewardTrackInputDto)
  tracks!: AwardRewardTrackInputDto[];
}

export class PublishAwardRewardPolicyDto extends AuditedAwardPolicyRevisionDto {
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

export class ReconcileAwardRewardDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export function isAwardUserTrackStatus(value: string): value is AwardUserTrackStatus {
  return (AWARD_USER_TRACK_STATUSES as readonly string[]).includes(value);
}
