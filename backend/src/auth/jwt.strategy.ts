import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../database/prisma.service';
import {
  GENERIC_SESSION_ERROR,
  JWT_ACCESS_AUDIENCE,
  JWT_ACCESS_ISSUER,
} from './auth.constants';
import {
  AUTH_USER_SELECT,
  attachAuthSessionId,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './auth-user';
import type { AccessTokenPayload } from './auth.types';

function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.sub === 'string' &&
    candidate.sub.length > 0 &&
    candidate.type === 'access' &&
    typeof candidate.sid === 'string' &&
    candidate.sid.length > 0
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      ignoreExpiration: false,
      algorithms: ['HS256'],
      audience: JWT_ACCESS_AUDIENCE,
      issuer: JWT_ACCESS_ISSUER,
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    const session = await this.prisma.authSession.findUnique({
      where: {
        id: payload.sid,
      },
      select: {
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: AUTH_USER_SELECT,
        },
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    return attachAuthSessionId(toAuthenticatedUser(session.user), payload.sid);
  }
}
