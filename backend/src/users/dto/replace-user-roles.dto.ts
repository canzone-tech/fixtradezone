import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class ReplaceUserRolesDto {
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((role) =>
          typeof role === 'string'
            ? role.trim().toUpperCase()
            : role,
        )
      : value,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roleNames!: string[];
}
