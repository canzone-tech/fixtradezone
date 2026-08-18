import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { normalizeEmail } from './string.transformers';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
