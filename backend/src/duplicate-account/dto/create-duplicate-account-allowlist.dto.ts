import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const DUPLICATE_ACCOUNT_ALLOWLIST_TYPES = [
  'DEVICE_INSTALLATION_ID',
  'IP_ADDRESS',
] as const;

export type DuplicateAccountAllowlistType =
  (typeof DUPLICATE_ACCOUNT_ALLOWLIST_TYPES)[number];

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateDuplicateAccountAllowlistDto {
  @IsIn(DUPLICATE_ACCOUNT_ALLOWLIST_TYPES)
  type!: DuplicateAccountAllowlistType;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  value!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
