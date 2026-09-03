import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from './string.transformers';

export class VerifyEmailDto {
  @Transform(trimString)
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;
}
