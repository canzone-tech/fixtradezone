import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function trimNullableString({ value }: TransformFnParams): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trimString({ value }: TransformFnParams): unknown {
  if (value === undefined || typeof value !== 'string') {
    return value;
  }

  return value.trim();
}

export class UpdateOwnProfileDto {
  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(100)
  firstName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @MaxLength(100)
  lastName?: string | null;

  @IsOptional()
  @Transform(trimNullableString)
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be a valid E.164 mobile number',
  })
  phone?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MaxLength(191)
  withdrawalAddress?: string;
}
