import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  GENERIC_LOGIN_ERROR,
  GENERIC_SESSION_ERROR,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import {
  AUTH_USER_SELECT,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './auth-user';
import type { RequestContext } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { TokenService } from './token.service';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === code;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly rbacBootstrapService: RbacBootstrapService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto, context: RequestContext = {}) {
    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const defaultRole =
          await this.rbacBootstrapService.ensureDefaultUserRole(transaction);

        const user = await transaction.user.create({
          data: {
            email: dto.email,
            passwordHash,
            username: dto.username,
            phone: dto.phone,
            firstName: dto.firstName,
            lastName: dto.lastName,
            roles: {
              create: {
                role: {
                  connect: {
                    id: defaultRole.id,
                  },
                },
              },
            },
          },
          select: AUTH_USER_SELECT,
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            description: 'User completed self-registration.',
            metadata: {
              source: 'SELF_REGISTRATION',
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Registration successful.',
          user: toAuthenticatedUser(user),
        };
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException(
          'An account already exists with one of the supplied identifiers.',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto, context: RequestContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
      select: {
        ...AUTH_USER_SELECT,
        passwordHash: true,
      },
    });
    const passwordMatches = await this.passwordService.verifyForAuthentication(
      user?.passwordHash ?? null,
      dto.password,
    );

    if (!user || !passwordMatches || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const tokens = await this.tokenService.issueTokenPair(user);
    const loggedInAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.create({
        data: {
          id: tokens.sessionId,
          userId: user.id,
          refreshTokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.refreshTokenExpiresAt,
        },
      });
      await transaction.user.update({
        where: {
          id: user.id,
        },
        data: {
          lastLoginAt: loggedInAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'LOGIN',
          entityType: 'AuthSession',
          entityId: tokens.sessionId,
          description: 'User login succeeded.',
          metadata: {
            event: 'SESSION_CREATED',
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return this.buildAuthResponse(
      tokens,
      {
        ...toAuthenticatedUser(user),
        lastLoginAt: loggedInAt,
      },
      'Login successful.',
    );
  }

  async refresh(dto: RefreshTokenDto, context: RequestContext = {}) {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );
    const refreshTokenHash = this.tokenService.hashRefreshToken(
      dto.refreshToken,
    );
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.jti,
        refreshTokenHash,
      },
      select: {
        id: true,
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
      session.user.email !== payload.email
    ) {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    if (session.revokedAt) {
      await this.revokeAllSessions(
        session.userId,
        'REFRESH_TOKEN_REUSE',
        context,
        session.id,
      );
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    if (session.expiresAt <= new Date()) {
      await this.revokeSession(
        session.userId,
        session.id,
        'REFRESH_TOKEN_EXPIRED',
        context,
      );
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    if (session.user.status !== 'ACTIVE') {
      await this.revokeAllSessions(
        session.userId,
        'USER_NOT_ACTIVE',
        context,
        session.id,
      );
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    const nextTokens = await this.tokenService.issueTokenPair(session.user);
    const rotatedAt = new Date();
    const rotationSucceeded = await this.prisma.$transaction(
      async (transaction) => {
        const consumed = await transaction.authSession.updateMany({
          where: {
            id: session.id,
            refreshTokenHash,
            revokedAt: null,
            expiresAt: {
              gt: rotatedAt,
            },
          },
          data: {
            revokedAt: rotatedAt,
            revocationReason: 'ROTATED',
            rotatedToSessionId: nextTokens.sessionId,
          },
        });

        if (consumed.count !== 1) {
          await transaction.authSession.updateMany({
            where: {
              userId: session.userId,
              revokedAt: null,
            },
            data: {
              revokedAt: rotatedAt,
              revocationReason: 'REFRESH_TOKEN_REUSE',
            },
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: session.userId,
              action: 'UPDATE',
              entityType: 'AuthSession',
              entityId: session.id,
              description:
                'Concurrent refresh-token reuse detected; active sessions revoked.',
              metadata: {
                event: 'REFRESH_TOKEN_REUSE',
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
          return false;
        }

        await transaction.authSession.create({
          data: {
            id: nextTokens.sessionId,
            userId: session.userId,
            refreshTokenHash: nextTokens.refreshTokenHash,
            expiresAt: nextTokens.refreshTokenExpiresAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: session.userId,
            action: 'UPDATE',
            entityType: 'AuthSession',
            entityId: session.id,
            description: 'Refresh token rotated.',
            metadata: {
              event: 'SESSION_ROTATED',
              rotatedToSessionId: nextTokens.sessionId,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return true;
      },
    );

    if (!rotationSucceeded) {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    return this.buildAuthResponse(
      nextTokens,
      toAuthenticatedUser(session.user),
      'Session refreshed.',
    );
  }

  async logout(dto: LogoutDto, context: RequestContext = {}) {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );
    const refreshTokenHash = this.tokenService.hashRefreshToken(
      dto.refreshToken,
    );
    const loggedOutAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.authSession.findFirst({
        where: {
          id: payload.jti,
          userId: payload.sub,
          refreshTokenHash,
        },
        select: {
          id: true,
          userId: true,
        },
      });

      if (!session) {
        return;
      }

      const revoked = await transaction.authSession.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: {
          revokedAt: loggedOutAt,
          revocationReason: 'LOGOUT',
        },
      });

      if (revoked.count === 1) {
        await transaction.auditLog.create({
          data: {
            actorUserId: session.userId,
            action: 'LOGOUT',
            entityType: 'AuthSession',
            entityId: session.id,
            description: 'User logged out and revoked the refresh session.',
            metadata: {
              event: 'SESSION_REVOKED',
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }
    });

    return {
      message: 'Logout successful.',
    };
  }

  private buildAuthResponse(
    tokens: {
      accessToken: string;
      refreshToken: string;
    },
    user: AuthenticatedUser,
    message: string,
  ) {
    return {
      message,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  }

  private async revokeSession(
    userId: string,
    sessionId: string,
    reason: string,
    context: RequestContext,
  ): Promise<void> {
    const revokedAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.authSession.updateMany({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
          revocationReason: reason,
        },
      });

      if (revoked.count === 1) {
        await transaction.auditLog.create({
          data: {
            actorUserId: userId,
            action: 'UPDATE',
            entityType: 'AuthSession',
            entityId: sessionId,
            description: 'Expired refresh session revoked.',
            metadata: {
              event: reason,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      }
    });
  }

  private async revokeAllSessions(
    userId: string,
    reason: string,
    context: RequestContext,
    sourceSessionId: string,
  ): Promise<void> {
    const revokedAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.authSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
          revocationReason: reason,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'UPDATE',
          entityType: 'AuthSession',
          entityId: sourceSessionId,
          description:
            'Active sessions revoked after a session security event.',
          metadata: {
            event: reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });
  }
}
