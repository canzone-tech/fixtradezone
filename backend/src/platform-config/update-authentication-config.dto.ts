import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAuthenticationConfigDto {
  @IsOptional()
  @IsBoolean()
  loginWithUsername?: boolean;

  @IsOptional()
  @IsBoolean()
  loginWithEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  loginWithMobile?: boolean;

  @IsOptional()
  @IsBoolean()
  captchaOnLoginEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  captchaOnRegistrationEnabled?: boolean;
}
