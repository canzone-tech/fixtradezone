import { IsEnum } from 'class-validator';

import { CaptchaPurpose } from '../captcha.types';

export class CreateCaptchaDto {
  @IsEnum(CaptchaPurpose)
  purpose!: CaptchaPurpose;
}
