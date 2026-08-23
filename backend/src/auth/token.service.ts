import { createHash, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  GENERIC_PASSWORD_CHANGE_ERROR,
  GENERIC_SESSION_ERROR,
  IMPERSONATION_TOKEN_TTL_SECONDS,
  JWT_ACCESS_AUDIENCE,
  JWT_ACCESS_ISSUER,
  JWT_IMPERSONATION_AUDIENCE,
  JWT_IMPERSONATION_ISSUER,
  JWT_PASSWORD_CHANGE_AUDIENCE,
  JWT_PASSWORD_CHANGE_ISSUER,
  JWT_REFRESH_AUDIENCE,
  JWT_REFRESH_ISSUER,
  PASSWORD_CHANGE_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import type {
  AccessTokenPayload,
  ImpersonationTokenPayload,
  PasswordChangeTokenPayload,
  RefreshTokenPayload,
} from './auth.types';

interface TokenUser {
  id: string;
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshTokenExpiresAt: Date;
  sessionId: string;
}

export interface IssuedImpersonationToken {
  impersonationToken: string;
  expiresAt: Date;
  expiresIn: number;
}

export interface IssuedPasswordChangeToken {
  passwordChangeToken: string;
  expiresAt: Date;
  expiresIn: number;
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
      type: 'access',
      sid: sessionId,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
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

  async issuePasswordChangeToken(
    user: TokenUser,
  ): Promise<IssuedPasswordChangeToken> {
    const payload: PasswordChangeTokenPayload = {
      sub: user.id,
      type: 'password_change',
      jti: randomUUID(),
    };

    const passwordChangeToken = await this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      algorithm: 'HS256',
      audience: JWT_PASSWORD_CHANGE_AUDIENCE,
      expiresIn: PASSWORD_CHANGE_TOKEN_TTL_SECONDS,
      issuer: JWT_PASSWORD_CHANGE_ISSUER,
    });

    return {
      passwordChangeToken,
      expiresAt: new Date(
        Date.now() + PASSWORD_CHANGE_TOKEN_TTL_SECONDS * 1000,
      ),
      expiresIn: PASSWORD_CHANGE_TOKEN_TTL_SECONDS,
    };
  }

  async issueImpersonationToken(
    subject: TokenUser,
    actorUserId: string,
    actorSessionId: string,
    impersonationId: string,
  ): Promise<IssuedImpersonationToken> {
    const payload: ImpersonationTokenPayload = {
      sub: subject.id,
      type: 'impersonation',
      iid: impersonationId,
      act: actorUserId,
      asid: actorSessionId,
    };

    const impersonationToken = await this.jwtService.signAsync(payload, {
      secret: this.accessSecret,
      algorithm: 'HS256',
      audience: JWT_IMPERSONATION_AUDIENCE,
      expiresIn: IMPERSONATION_TOKEN_TTL_SECONDS,
      issuer: JWT_IMPERSONATION_ISSUER,
    });

    return {
      impersonationToken,
      expiresAt: new Date(Date.now() + IMPERSONATION_TOKEN_TTL_SECONDS * 1000),
      expiresIn: IMPERSONATION_TOKEN_TTL_SECONDS,
    };
  }

  async verifyPasswordChangeToken(
    token: string,
  ): Promise<PasswordChangeTokenPayload> {
    try {
      const payload =
        await this.jwtService.verifyAsync<PasswordChangeTokenPayload>(token, {
          secret: this.accessSecret,
          algorithms: ['HS256'],
          audience: JWT_PASSWORD_CHANGE_AUDIENCE,
          issuer: JWT_PASSWORD_CHANGE_ISSUER,
        });

      if (payload.type !== 'password_change' || !payload.sub || !payload.jti) {
        throw new UnauthorizedException(GENERIC_PASSWORD_CHANGE_ERROR);
      }

      return payload;
    } catch {
      throw new UnauthorizedException(GENERIC_PASSWORD_CHANGE_ERROR);
    }
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

      if (payload.type !== 'refresh' || !payload.sub || !payload.jti) {
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
