import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';

export const DEPOSIT_APPROVAL_MODES = [
  'MANUAL',
  'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
] as const;

export type DepositApprovalMode = (typeof DEPOSIT_APPROVAL_MODES)[number];

export class ConfigureDepositApprovalModeDto {
  @IsIn(DEPOSIT_APPROVAL_MODES)
  approvalMode!: DepositApprovalMode;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
