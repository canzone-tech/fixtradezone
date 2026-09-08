import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class GenealogyPageQueryDto {
  @IsOptional()
  @IsUUID('4')
  parentUserId?: string;

  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? 1 : Number(value),
  )
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? 25 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}

export class AdminGenealogyPageQueryDto extends GenealogyPageQueryDto {
  @IsOptional()
  @IsUUID('4')
  rootUserId?: string;
}

export class AdminGenealogySearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query!: string;
}
