import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './dto';
import { Public } from './public.decorator';
import { getRequestContext } from './request-context';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, getRequestContext(request));
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, getRequestContext(request));
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request) {
    return this.authService.refresh(dto, getRequestContext(request));
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('logout')
  logout(@Body() dto: LogoutDto, @Req() request: Request) {
    return this.authService.logout(dto, getRequestContext(request));
  }

  @Header('Cache-Control', 'no-store')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      user,
    };
  }
}
