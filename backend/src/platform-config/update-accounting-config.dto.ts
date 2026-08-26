import { IsIn } from 'class-validator';

export const DEPOSIT_POSTING_MODES = [
  'AUTO_ON_APPROVAL',
  'MANUAL_RECONCILIATION',
] as const;

export type DepositPostingMode = (typeof DEPOSIT_POSTING_MODES)[number];

export class UpdateAccountingConfigDto {
  @IsIn(DEPOSIT_POSTING_MODES)
  depositPostingMode!: DepositPostingMode;
}
