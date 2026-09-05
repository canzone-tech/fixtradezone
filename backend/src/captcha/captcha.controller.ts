import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PublicAuthRateLimit } from '../auth/public-auth-rate-limit.decorator';
import { PublicAuthRateLimitGuard } from '../auth/public-auth-rate-limit.guard';
import { Public } from '../auth/public.decorator';
import { CaptchaService } from './captcha.service';
import { CreateCaptchaDto } from './dto/create-captcha.dto';

@Controller('auth')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Public()
  @UseGuards(PublicAuthRateLimitGuard)
  @PublicAuthRateLimit({
    name: 'captcha',
    limit: 120,
    windowSeconds: 900,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('captcha')
  create(@Body() dto: CreateCaptchaDto) {
    return this.captchaService.createChallenge(dto.purpose);
  }
}
