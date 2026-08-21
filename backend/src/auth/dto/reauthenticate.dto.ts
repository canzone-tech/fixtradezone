import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReauthenticateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
