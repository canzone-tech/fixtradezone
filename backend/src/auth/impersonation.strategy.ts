import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../database/prisma.service';
import { PERMISSIONS } from '../rbac/rbac.constants';
import {
  ADMIN_ROLE_NAME,
  DEFAULT_USER_ROLE_NAME,
  GENERIC_IMPERSONATION_ERROR,
  JWT_IMPERSONATION_AUDIENCE,
  JWT_IMPERSONATION_ISSUER,
  SUPER_ADMIN_ROLE_NAME,
} from './auth.constants';
import { AUTH_USER_SELECT, toAuthenticatedUser } from './auth-user';
import type { ImpersonationTokenPayload } from './auth.types';
import type { ImpersonationPrincipal } from './impersonation.types';

function isImpersonationTokenPayload(
  payload: unknown,
): payload is ImpersonationTokenPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.sub === 'string' &&
    candidate.sub.length > 0 &&
    candidate.type === 'impersonation' &&
    typeof candidate.iid === 'string' &&
    candidate.iid.length > 0 &&
    typeof candidate.act === 'string' &&
    candidate.act.length > 0 &&
    typeof candidate.asid === 'string' &&
    candidate.asid.length > 0
  );
}

@Injectable()
export class ImpersonationStrategy extends PassportStrategy(
  Strategy,
  'impersonation',
) {
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
      audience: JWT_IMPERSONATION_AUDIENCE,
      issuer: JWT_IMPERSONATION_ISSUER,
    });
  }

  async validate(payload: unknown): Promise<ImpersonationPrincipal> {
    if (!isImpersonationTokenPayload(payload)) {
      throw new UnauthorizedException(GENERIC_IMPERSONATION_ERROR);
    }

    const session = await this.prisma.impersonationSession.findUnique({
      where: {
        id: payload.iid,
      },
      select: {
        id: true,
        actorUserId: true,
        subjectUserId: true,
        actorSessionId: true,
        activeKey: true,
        expiresAt: true,
        endedAt: true,
        createdAt: true,
        actor: {
          select: AUTH_USER_SELECT,
        },
        subject: {
          select: AUTH_USER_SELECT,
        },
        actorSession: {
          select: {
            id: true,
            userId: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
      },
    });

    const now = new Date();

    if (
      !session ||
      session.id !== payload.iid ||
      session.actorUserId !== payload.act ||
      session.subjectUserId !== payload.sub ||
      session.actorSessionId !== payload.asid ||
      session.activeKey !== payload.asid ||
      session.endedAt !== null ||
      session.expiresAt <= now ||
      session.actorSession.id !== payload.asid ||
      session.actorSession.userId !== payload.act ||
      session.actorSession.revokedAt !== null ||
      session.actorSession.expiresAt <= now
    ) {
      throw new UnauthorizedException(GENERIC_IMPERSONATION_ERROR);
    }

    const actor = toAuthenticatedUser(session.actor);

    const subject = toAuthenticatedUser(session.subject);

    const actorIsSuperAdmin = actor.roles.includes(SUPER_ADMIN_ROLE_NAME);

    const actorIsAuthorizedAdmin =
      actor.roles.includes(ADMIN_ROLE_NAME) &&
      actor.permissions.includes(PERMISSIONS.USERS_IMPERSONATE);

    if (
      actor.status !== 'ACTIVE' ||
      (!actorIsSuperAdmin && !actorIsAuthorizedAdmin)
    ) {
      throw new UnauthorizedException(GENERIC_IMPERSONATION_ERROR);
    }

    if (
      subject.status !== 'ACTIVE' ||
      !subject.roles.includes(DEFAULT_USER_ROLE_NAME) ||
      subject.roles.includes(ADMIN_ROLE_NAME) ||
      subject.roles.includes(SUPER_ADMIN_ROLE_NAME)
    ) {
      throw new UnauthorizedException(GENERIC_IMPERSONATION_ERROR);
    }

    return {
      user: subject,
      impersonation: {
        id: session.id,
        startedAt: session.createdAt,
        expiresAt: session.expiresAt,
        actor: {
          id: actor.id,
          email: actor.email,
        },
      },
    };
  }
}
