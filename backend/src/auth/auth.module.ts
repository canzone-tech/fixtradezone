import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FounderAdminBootstrapService } from './founder-admin-bootstrap.service';
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
    FounderAdminBootstrapService,
    JwtStrategy,
    PasswordService,
    RbacBootstrapService,
    TokenService,
  ],
  exports: [AuthService, FounderAdminBootstrapService],
})
export class AuthModule {}
