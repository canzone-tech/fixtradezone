import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeRequiredPasswordDto {
  @IsString()
  @IsNotEmpty()
  passwordChangeToken!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
