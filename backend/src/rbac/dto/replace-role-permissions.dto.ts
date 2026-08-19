import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class ReplaceRolePermissionsDto {
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((code) =>
          typeof code === 'string'
            ? code.trim().toLowerCase()
            : code,
        )
      : value,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  @Matches(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/, {
    each: true,
    message: 'permissionCodes contains an invalid permission code',
  })
  permissionCodes!: string[];
}
