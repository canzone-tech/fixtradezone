import { Transform } from 'class-transformer';
import {
  IsJWT,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @IsJWT()
  refreshToken!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsUUID('4')
  deviceInstallationId?: string;
}
