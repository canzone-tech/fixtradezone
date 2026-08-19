import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FounderSuperAdminBootstrapService } from './founder-super-admin-bootstrap.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    FounderSuperAdminBootstrapService,
    JwtStrategy,
    PasswordService,
    RbacBootstrapService,
    TokenService,
  ],
  exports: [AuthService, FounderSuperAdminBootstrapService],
})
export class AuthModule {}
