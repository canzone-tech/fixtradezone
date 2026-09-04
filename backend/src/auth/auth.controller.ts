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
import { ChangePasswordService } from './change-password.service';
import { CurrentUser } from './current-user.decorator';
import {
  ChangePasswordDto,
  ChangeRequiredPasswordDto,
  LoginDto,
  LogoutDto,
  ReauthenticateDto,
  RefreshTokenDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResendEmailVerificationDto,
  ResetPasswordDto,
  UpdateOwnProfileDto,
  VerifyEmailDto,
} from './dto';
import { EmailVerificationService } from './email-verification.service';
import { OwnProfileService } from './own-profile.service';
import { PasswordResetService } from './password-reset.service';
import { PublicAuthRateLimit } from './public-auth-rate-limit.decorator';
import { PublicAuthRateLimitGuard } from './public-auth-rate-limit.guard';
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
    private readonly passwordResetService: PasswordResetService,
    private readonly changePasswordService: ChangePasswordService,
    private readonly ownProfileService: OwnProfileService,
  ) {}

  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('registration-policy')
  registrationPolicy() {
    return this.registrationService.getPublicRegistrationPolicy();
  }

  @Public()
  @UseGuards(PublicAuthRateLimitGuard, CaptchaGuard)
  @PublicAuthRateLimit({
    name: 'register',
    limit: 30,
    windowSeconds: 3600,
    identityField: 'email',
    identityLimit: 5,
  })
  @RequireCaptcha(CaptchaPurpose.REGISTRATION)
  @Header('Cache-Control', 'no-store')
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, getRequestContext(request));
  }

  @Public()
  @UseGuards(PublicAuthRateLimitGuard)
  @PublicAuthRateLimit({
    name: 'email-verify',
    limit: 60,
    windowSeconds: 900,
  })
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
  @UseGuards(PublicAuthRateLimitGuard)
  @PublicAuthRateLimit({
    name: 'email-resend',
    limit: 30,
    windowSeconds: 3600,
    identityField: 'email',
    identityLimit: 6,
  })
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
  @UseGuards(PublicAuthRateLimitGuard)
  @PublicAuthRateLimit({
    name: 'password-reset-request',
    limit: 30,
    windowSeconds: 3600,
    identityField: 'email',
    identityLimit: 6,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('password-reset/request')
  requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() request: Request,
  ) {
    return this.passwordResetService.request(
      dto.email,
      getRequestContext(request),
    );
  }

  @Public()
  @UseGuards(PublicAuthRateLimitGuard)
  @PublicAuthRateLimit({
    name: 'password-reset-complete',
    limit: 30,
    windowSeconds: 900,
  })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('password-reset/complete')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.passwordResetService.reset(
      dto.token,
      dto.newPassword,
      getRequestContext(request),
    );
  }

  @Public()
  @UseGuards(PublicAuthRateLimitGuard, CaptchaGuard)
  @PublicAuthRateLimit({
    name: 'login',
    limit: 120,
    windowSeconds: 900,
    identityField: 'identifier',
    identityLimit: 12,
  })
  @RequireCaptcha(CaptchaPurpose.LOGIN)
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, getRequestContext(request));
  }

  @Public()
  @UseGuards(PublicAuthRateLimitGuard)
  @PublicAuthRateLimit({
    name: 'required-password-change',
    limit: 30,
    windowSeconds: 900,
  })
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
  @HttpCode(200)
  @Post('change-password')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.changePasswordService.change(
      user.id,
      dto.currentPassword,
      dto.newPassword,
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
