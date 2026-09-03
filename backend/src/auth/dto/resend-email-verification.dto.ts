import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { normalizeEmail } from './string.transformers';

export class ResendEmailVerificationDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(191)
  email!: string;
}
