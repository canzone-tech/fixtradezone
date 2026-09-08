import { Module } from '@nestjs/common';

import { PublicAuthRateLimitGuard } from '../auth/public-auth-rate-limit.guard';
import { CaptchaController } from './captcha.controller';
import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';

@Module({
  controllers: [CaptchaController],
  providers: [CaptchaGuard, CaptchaService, PublicAuthRateLimitGuard],
  exports: [CaptchaGuard, CaptchaService],
})
export class CaptchaModule {}
