import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Min } from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';

export class ApplyClientPackageProfileDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
