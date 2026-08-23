import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  GENERIC_LOGIN_ERROR,
  GENERIC_PASSWORD_CHANGE_ERROR,
  GENERIC_SESSION_ERROR,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import {
  AUTH_USER_SELECT,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './auth-user';
import type { RequestContext } from './auth.types';
import { ChangeRequiredPasswordDto } from './dto/change-required-password.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly registrationService: RegistrationService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto, context: RequestContext = {}) {
    return this.registrationService.registerPublic(dto, context);
  }

  async login(dto: LoginDto, context: RequestContext = {}) {
    const identifier = dto.identifier.trim();

    const [authConfig, registrationConfig] = await Promise.all([
      this.prisma.systemAuthConfig.findUnique({
        where: { id: 1 },
      }),
      this.prisma.systemRegistrationConfig.findUnique({
        where: { id: 1 },
      }),
    ]);

    const multipleAccountsEnabled =
      (registrationConfig?.allowMultipleAccountsPerEmail ?? false) ||
      (registrationConfig?.allowMultipleAccountsPerMobile ?? false);

    const identifierType = /^\+[1-9]\d{7,14}$/.test(identifier)
      ? 'MOBILE'
      : identifier.includes('@')
        ? 'EMAIL'
        : 'USERNAME';

    if (multipleAccountsEnabled && identifierType !== 'USERNAME') {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const methodEnabled =
      identifierType === 'USERNAME'
        ? (authConfig?.loginWithUsername ?? true)
        : identifierType === 'EMAIL'
          ? (authConfig?.loginWithEmail ?? true)
          : (authConfig?.loginWithMobile ?? true);

    if (!methodEnabled) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const normalizedIdentifier =
      identifierType === 'EMAIL' || identifierType === 'USERNAME'
        ? identifier.toLowerCase()
        : identifier;

    const userSelect = {
      ...AUTH_USER_SELECT,
      passwordHash: true,
      mustChangePassword: true,
    } as const;

    const identifierMatches =
      identifierType === 'USERNAME'
        ? null
        : await this.prisma.user.findMany({
            where:
              identifierType === 'EMAIL'
                ? {
                    email: normalizedIdentifier,
                  }
                : {
                    phone: normalizedIdentifier,
                  },
            take: 2,
            select: userSelect,
          });

    const user =
      identifierType === 'USERNAME'
        ? await this.prisma.user.findUnique({
            where: {
              username: normalizedIdentifier,
            },
            select: userSelect,
          })
        : identifierMatches?.length === 1
          ? identifierMatches[0]
          : null;

    const passwordMatches = await this.passwordService.verifyForAuthentication(
      user?.passwordHash ?? null,
      dto.password,
    );

    if (!user || !passwordMatches || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (user.mustChangePassword) {
      const passwordChange =
        await this.tokenService.issuePasswordChangeToken(user);

      const challengedAt = new Date();

      await this.prisma.$transaction(async (transaction) => {
        await transaction.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: challengedAt,
            revocationReason: 'PASSWORD_CHANGE_REQUIRED',
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'LOGIN',
            entityType: 'User',
            entityId: user.id,
            description:
              'Temporary password verified; password change is required.',
            metadata: {
              event: 'PASSWORD_CHANGE_REQUIRED',
              identifierType,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      });

      return {
        message: 'Password change required.',
        passwordChangeRequired: true,
        passwordChangeToken: passwordChange.passwordChangeToken,
        expiresIn: passwordChange.expiresIn,
        user: {
          id: user.id,
          username: user.username,
        },
      };
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
            identifierType,
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

  async changeRequiredPassword(
    dto: ChangeRequiredPasswordDto,
    context: RequestContext = {},
  ) {
    const payload = await this.tokenService.verifyPasswordChangeToken(
      dto.passwordChangeToken,
    );

    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        passwordHash: true,
        mustChangePassword: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE' || !user.mustChangePassword) {
      throw new UnauthorizedException(GENERIC_PASSWORD_CHANGE_ERROR);
    }

    const reusesCurrentPassword =
      await this.passwordService.verifyForAuthentication(
        user.passwordHash,
        dto.newPassword,
      );

    if (reusesCurrentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);

    const changedAt = new Date();

    await this.prisma.$transaction(
      async (transaction) => {
        const updated = await transaction.user.updateMany({
          where: {
            id: user.id,
            status: 'ACTIVE',
            mustChangePassword: true,
          },
          data: {
            passwordHash,
            mustChangePassword: false,
          },
        });

        if (updated.count !== 1) {
          throw new UnauthorizedException(GENERIC_PASSWORD_CHANGE_ERROR);
        }

        const revoked = await transaction.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: changedAt,
            revocationReason: 'PASSWORD_CHANGED',
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'UPDATE',
            entityType: 'UserCredential',
            entityId: user.id,
            description: 'User completed required password change.',
            metadata: {
              event: 'REQUIRED_PASSWORD_CHANGED',
              revokedSessionCount: revoked.count,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    return {
      message: 'Password changed successfully. Please sign in again.',
    };
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

    if (!session || session.userId !== payload.sub) {
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
