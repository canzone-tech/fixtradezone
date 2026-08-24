import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trimNullableString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateReferralConfigDto {
  @IsOptional()
  @IsBoolean()
  enrollmentEnabled?: boolean;

  @Transform(trimNullableString)
  @IsOptional()
  @IsString()
  @IsUUID()
  @MaxLength(36)
  primaryRootUserId?: string;

  @Transform(trimNullableString)
  @IsOptional()
  @IsString()
  @IsUUID()
  @MaxLength(36)
  defaultSponsorUserId?: string;

  @IsOptional()
  @IsBoolean()
  adminSponsorChangeEnabled?: boolean;
}
