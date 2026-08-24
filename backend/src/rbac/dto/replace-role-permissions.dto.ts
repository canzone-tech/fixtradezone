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
  @Transform(({ value }: { value: unknown }) => {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((code: unknown) =>
      typeof code === 'string' ? code.trim().toLowerCase() : code,
    );
  })
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
