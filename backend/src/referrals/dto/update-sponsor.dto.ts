import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class UpdateSponsorDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsUUID()
  @MaxLength(36)
  sponsorUserId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 500)
  reason!: string;
}
