import { Module } from '@nestjs/common';

import { CaptchaController } from './captcha.controller';
import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';

@Module({
  controllers: [CaptchaController],
  providers: [CaptchaGuard, CaptchaService],
  exports: [CaptchaGuard, CaptchaService],
})
export class CaptchaModule {}
