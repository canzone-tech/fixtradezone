import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';
import { INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY } from '../internal-trading.constants';

const PERCENT_PATTERN = /^\d{1,3}(?:\.\d{1,6})?$/;
const ASSET_PATTERN = /^[A-Z0-9._-]{2,32}$/;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function normalizeAssetSymbols(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((item): unknown =>
    typeof item === 'string' ? item.trim().toUpperCase() : item,
  );
}

export class InternalTradingTimingWindowDto {
  @Transform(trimString)
  @IsString()
  @Matches(CLOCK_PATTERN)
  start!: string;

  @Transform(trimString)
  @IsString()
  @Matches(CLOCK_PATTERN)
  end!: string;
}

class AuditedInternalTradingRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateInternalTradingPolicyDraftDto {
  @Transform(trimString)
  @IsString()
  @IsUUID()
  sourcePolicyVersionId!: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateInternalTradingPolicyDto extends AuditedInternalTradingRevisionDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY)
  activitiesPerDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Transform(({ value }: { value: unknown }) => normalizeAssetSymbols(value))
  @IsString({ each: true })
  @Matches(ASSET_PATTERN, { each: true })
  assetSymbols?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  winWeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  lossWeight?: number;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  winMinimumPercent?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  winMaximumPercent?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  lossMinimumPercent?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  lossMaximumPercent?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => InternalTradingTimingWindowDto)
  timingWindows?: InternalTradingTimingWindowDto[];

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  userSharePercent?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  adminSharePercent?: string;
}

export class PublishInternalTradingPolicyDto extends AuditedInternalTradingRevisionDto {}
