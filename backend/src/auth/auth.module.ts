import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ACCESS_AUDIENCE,
  JWT_ACCESS_ISSUER,
} from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          audience: JWT_ACCESS_AUDIENCE,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          issuer: JWT_ACCESS_ISSUER,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordService, RbacBootstrapService],
  exports: [AuthService],
})
export class AuthModule {}
