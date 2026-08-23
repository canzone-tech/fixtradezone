import type { TransformFnParams } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

function normalizeUsernamePrefix({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class UpdateRegistrationConfigDto {
  @IsOptional()
  @IsBoolean()
  publicRegistrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  superAdminRegistrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  adminRegistrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  authorizedUserRegistrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  mobileRequired?: boolean;

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL', 'AUTO_OR_MANUAL'])
  passwordMode?: 'AUTO' | 'MANUAL' | 'AUTO_OR_MANUAL';

  @IsOptional()
  @IsIn(['AUTO', 'MANUAL', 'AUTO_OR_MANUAL'])
  usernameMode?: 'AUTO' | 'MANUAL' | 'AUTO_OR_MANUAL';

  @IsOptional()
  @IsBoolean()
  usernamePrefixEnabled?: boolean;

  @Transform(normalizeUsernamePrefix)
  @IsOptional()
  @IsString()
  @Length(1, 20)
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'usernamePrefix may contain only letters, numbers, underscores, and hyphens',
  })
  usernamePrefix?: string;

  @IsOptional()
  @IsBoolean()
  allowMultipleAccountsPerEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  allowMultipleAccountsPerMobile?: boolean;
}
