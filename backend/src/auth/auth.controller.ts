import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CaptchaGuard } from '../captcha/captcha.guard';
import { RequireCaptcha } from '../captcha/require-captcha.decorator';
import { CaptchaPurpose } from '../captcha/captcha.types';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth-user';
import { CurrentUser } from './current-user.decorator';
import {
  ChangeRequiredPasswordDto,
  LoginDto,
  LogoutDto,
  ReauthenticateDto,
  RefreshTokenDto,
  RegisterDto,
  ResendEmailVerificationDto,
  UpdateOwnProfileDto,
  VerifyEmailDto,
} from './dto';
import { EmailVerificationService } from './email-verification.service';
import { OwnProfileService } from './own-profile.service';
import { Public } from './public.decorator';
import { ReauthenticationService } from './reauthentication.service';
import { RegistrationService } from './registration.service';
import { getRequestContext } from './request-context';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly reauthenticationService: ReauthenticationService,
    private readonly registrationService: RegistrationService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly ownProfileService: OwnProfileService,
  ) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('registration-policy')
  registrationPolicy() {
    return this.registrationService.getPublicRegistrationPolicy();
  }

  @Public()
  @UseGuards(CaptchaGuard)
  @RequireCaptcha(CaptchaPurpose.REGISTRATION)
  @Header('Cache-Control', 'no-store')
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, getRequestContext(request));
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('email-verification/verify')
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request) {
    return this.emailVerificationService.verify(
      dto.token,
      getRequestContext(request),
    );
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('email-verification/resend')
  resendEmailVerification(
    @Body() dto: ResendEmailVerificationDto,
    @Req() request: Request,
  ) {
    return this.emailVerificationService.resend(
      dto.email,
      getRequestContext(request),
    );
  }

  @Public()
  @UseGuards(CaptchaGuard)
  @RequireCaptcha(CaptchaPurpose.LOGIN)
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, getRequestContext(request));
  }

  @Public()
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('change-required-password')
  changeRequiredPassword(
    @Body() dto: ChangeRequiredPasswordDto,
    @Req() request: Request,
  ) {
    return this.authService.changeRequiredPassword(
      dto,
      getRequestContext(request),
    );
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
  @HttpCode(200)
  @Post('reauthenticate')
  reauthenticate(
    @Body() dto: ReauthenticateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.reauthenticationService.reauthenticate(
      user,
      dto,
      getRequestContext(request),
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      user,
    };
  }

  @Header('Cache-Control', 'no-store')
  @Patch('me/profile')
  updateOwnProfile(
    @Body() dto: UpdateOwnProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ownProfileService.update(user, dto, getRequestContext(request));
  }
}
