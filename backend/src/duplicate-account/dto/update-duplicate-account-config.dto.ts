import { IsIn, IsOptional } from 'class-validator';

export const DUPLICATE_ACCOUNT_ENFORCEMENT_MODES = [
  'OFF',
  'MONITOR',
  'RESTRICT',
  'BLOCK',
] as const;

export type DuplicateAccountEnforcementMode =
  (typeof DUPLICATE_ACCOUNT_ENFORCEMENT_MODES)[number];

export class UpdateDuplicateAccountConfigDto {
  @IsOptional()
  @IsIn(DUPLICATE_ACCOUNT_ENFORCEMENT_MODES)
  enforcementMode?: DuplicateAccountEnforcementMode;
}
