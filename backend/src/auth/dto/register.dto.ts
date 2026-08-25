import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  normalizeEmail,
  normalizeUsername,
  trimString,
} from './string.transformers';

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password?: string;

  @Transform(normalizeUsername)
  @IsOptional()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-z0-9._-]+$/, {
    message:
      'username may contain only letters, numbers, periods, underscores, and hyphens',
  })
  username?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must use E.164 format, for example +919876543210',
  })
  phone?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  referralCode?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(128)
  captchaId?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  captchaAnswer?: string;
}
