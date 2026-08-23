import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';

import { Public } from '../auth/public.decorator';
import { CaptchaService } from './captcha.service';
import { CreateCaptchaDto } from './dto/create-captcha.dto';

@Controller('auth')
export class CaptchaController {
  constructor(private readonly captchaService: CaptchaService) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('captcha')
  create(@Body() dto: CreateCaptchaDto) {
    return this.captchaService.createChallenge(dto.purpose);
  }
}
