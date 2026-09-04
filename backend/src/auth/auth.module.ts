import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CaptchaModule } from '../captcha/captcha.module';
import { DuplicateAccountModule } from '../duplicate-account/duplicate-account.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { FounderSuperAdminBootstrapService } from './founder-super-admin-bootstrap.service';
import { FullImpersonationGuard } from './full-impersonation.guard';
import { ImpersonationAuthGuard } from './impersonation-auth.guard';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationStrategy } from './impersonation.strategy';
import { JwtStrategy } from './jwt.strategy';
import { OwnProfileService } from './own-profile.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { ReauthenticationService } from './reauthentication.service';
import { RegistrationService } from './registration.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    CaptchaModule,
    DuplicateAccountModule,
    ReferralsModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    SecurityConfigModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController, ImpersonationController],
  providers: [
    AuthService,
    EmailVerificationService,
    FounderSuperAdminBootstrapService,
    FullImpersonationGuard,
    ImpersonationAuthGuard,
    ImpersonationStrategy,
    JwtStrategy,
    OwnProfileService,
    PasswordResetService,
    PasswordService,
    ReauthenticationService,
    RegistrationService,
    RbacBootstrapService,
    TokenService,
  ],
  exports: [
    AuthService,
    EmailVerificationService,
    FounderSuperAdminBootstrapService,
    OwnProfileService,
    PasswordResetService,
    PasswordService,
    RegistrationService,
    RbacBootstrapService,
    TokenService,
  ],
})
export class AuthModule {}
