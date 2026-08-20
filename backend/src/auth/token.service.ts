import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  GENERIC_SESSION_ERROR,
  JWT_ACCESS_AUDIENCE,
  JWT_ACCESS_ISSUER,
  JWT_REFRESH_AUDIENCE,
  JWT_REFRESH_ISSUER,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types';

interface TokenUser {
  id: string;
  email: string;
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    const accessSecret = configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');

    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets are not configured.');
    }

    this.accessSecret = accessSecret;
    this.refreshSecret = refreshSecret;
  }

  async issueTokenPair(
    user: TokenUser,
    sessionId = randomUUID(),
  ): Promise<IssuedTokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
      sid: sessionId,
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'refresh',
      jti: sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.accessSecret,
        algorithm: 'HS256',
        audience: JWT_ACCESS_AUDIENCE,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: JWT_ACCESS_ISSUER,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        algorithm: 'HS256',
        audience: JWT_REFRESH_AUDIENCE,
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        issuer: JWT_REFRESH_ISSUER,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      refreshTokenExpiresAt: new Date(
        Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
      ),
      sessionId,
    };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.refreshSecret,
          algorithms: ['HS256'],
          audience: JWT_REFRESH_AUDIENCE,
          issuer: JWT_REFRESH_ISSUER,
        },
      );

      if (
        payload.type !== 'refresh' ||
        !payload.sub ||
        !payload.email ||
        !payload.jti
      ) {
        throw new UnauthorizedException(GENERIC_SESSION_ERROR);
      }

      return payload;
    } catch {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
