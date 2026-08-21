import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSecurityConfigDto {
  @IsOptional()
  @IsBoolean()
  fullUserImpersonationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  idleLockMinutes?: number;
}
