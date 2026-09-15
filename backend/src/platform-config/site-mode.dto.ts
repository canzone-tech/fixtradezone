import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../auth/dto/string.transformers';

export const SITE_MODES = ['LIVE', 'TESTING', 'MAINTENANCE'] as const;
export type SiteMode = (typeof SITE_MODES)[number];

export class UpdateSiteModeDto {
  @IsIn(SITE_MODES)
  siteMode!: SiteMode;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;

  @Transform(trimString)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Length(3, 500)
  message?: string | null;

  @Transform(trimString)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  launchAt?: string | null;
}

export class AddSiteModeTesterDto {
  @Transform(trimString)
  @IsString()
  @Length(2, 191)
  identifier!: string;

  @Transform(trimString)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @Length(3, 500)
  note?: string | null;
}

export class UnlockEmergencyRecoveryDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsInt()
  @Min(5)
  @Max(60)
  durationMinutes!: number;
}

export class LockEmergencyRecoveryDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
