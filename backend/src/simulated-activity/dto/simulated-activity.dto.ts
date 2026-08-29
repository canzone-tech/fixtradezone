import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
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
import {
  SIMULATED_ACTIVITY_MAX_PER_DAY,
  SIMULATED_ACTIVITY_OUTCOMES,
  type SimulatedActivityOutcome,
} from '../simulated-activity.constants';

const PERCENT_PATTERN = /^\d{1,3}(?:\.\d{1,6})?$/;
const ASSET_PATTERN = /^[A-Z0-9._-]{2,32}$/;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class SimulatedActivityPageQueryDto {
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

export class AdminSimulatedActivityEventQueryDto extends SimulatedActivityPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsIn(SIMULATED_ACTIVITY_OUTCOMES)
  outcome?: SimulatedActivityOutcome;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  localActivityDate?: string;
}

export class SimulatedTimingWindowDto {
  @Transform(trimString)
  @IsString()
  @Matches(CLOCK_PATTERN)
  start!: string;

  @Transform(trimString)
  @IsString()
  @Matches(CLOCK_PATTERN)
  end!: string;
}

class AuditedSimulationPolicyRevisionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateSimulatedActivityPolicyDraftDto {
  @Transform(trimString)
  @IsString()
  @IsUUID()
  sourcePolicyVersionId!: string;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateSimulatedActivityPolicyDto extends AuditedSimulationPolicyRevisionDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SIMULATED_ACTIVITY_MAX_PER_DAY)
  activitiesPerDay?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item) =>
          typeof item === 'string' ? item.trim().toUpperCase() : item,
        )
      : value,
  )
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
  @Type(() => SimulatedTimingWindowDto)
  timingWindows?: SimulatedTimingWindowDto[];
}

// Publication time is system-controlled. A new version becomes effective on a
// safe local calendar-day boundary; callers cannot backdate or force a partial day.
export class PublishSimulatedActivityPolicyDto extends AuditedSimulationPolicyRevisionDto {}
