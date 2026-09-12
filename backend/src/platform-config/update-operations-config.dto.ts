import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { trimString } from '../auth/dto/string.transformers';

export const OPERATIONS_MODES = ['AUTOMATIC', 'CONTROLLED_MANUAL'] as const;
export type OperationsMode = (typeof OPERATIONS_MODES)[number];
export const PLATFORM_TIMEZONE = 'UTC' as const;

export class UpdateOperationsConfigDto {
  @Transform(trimString)
  @IsIn([PLATFORM_TIMEZONE])
  platformTimezone!: typeof PLATFORM_TIMEZONE;

  @IsIn(OPERATIONS_MODES)
  operationsMode!: OperationsMode;
}
