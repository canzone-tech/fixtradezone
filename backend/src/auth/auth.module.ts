import { Module } from '@nestjs/common';
import { CaptchaModule } from '../captcha/captcha.module';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FounderSuperAdminBootstrapService } from './founder-super-admin-bootstrap.service';
import { FullImpersonationGuard } from './full-impersonation.guard';
import { ImpersonationAuthGuard } from './impersonation-auth.guard';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationStrategy } from './impersonation.strategy';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { ReauthenticationService } from './reauthentication.service';
import { RegistrationService } from './registration.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    CaptchaModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    SecurityConfigModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController, ImpersonationController],
  providers: [
    AuthService,
    FounderSuperAdminBootstrapService,
    FullImpersonationGuard,
    ImpersonationAuthGuard,
    ImpersonationStrategy,
    JwtStrategy,
    PasswordService,
    ReauthenticationService,
    RegistrationService,
    RbacBootstrapService,
    TokenService,
  ],
  exports: [
    AuthService,
    FounderSuperAdminBootstrapService,
    PasswordService,
    RegistrationService,
    RbacBootstrapService,
    TokenService,
  ],
})
export class AuthModule {}
