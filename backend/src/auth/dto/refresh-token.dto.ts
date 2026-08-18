import { IsJWT, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @IsJWT()
  refreshToken!: string;
}
