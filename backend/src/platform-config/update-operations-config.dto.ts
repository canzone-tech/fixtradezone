import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';
import { trimString } from '../auth/dto/string.transformers';

export const OPERATIONS_MODES = ['AUTOMATIC', 'CONTROLLED_MANUAL'] as const;
export type OperationsMode = (typeof OPERATIONS_MODES)[number];

export class UpdateOperationsConfigDto {
  @Transform(trimString)
  @IsString()
  @Length(1, 64)
  platformTimezone!: string;

  @IsIn(OPERATIONS_MODES)
  operationsMode!: OperationsMode;
}
