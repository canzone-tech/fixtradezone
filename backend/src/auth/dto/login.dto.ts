import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from './string.transformers';

export class LoginDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
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
