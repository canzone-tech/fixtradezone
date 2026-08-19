import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { AUTH_USER_SELECT } from './auth-user';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  const activeUser = {
    id: 'user-id',
    email: 'user@example.com',
    username: 'trader.one',
    phone: '+919876543210',
    firstName: 'Prashant',
    lastName: 'Shukla',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-18T00:00:00.000Z'),
    lastLoginAt: null,
    passwordHash: 'argon2-hash',
    roles: [
      {
        role: {
          name: 'ADMIN',
          status: 'ACTIVE' as const,
          permissions: [],
        },
      },
    ],
  };
  const issuedTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenHash: 'refresh-token-hash',
    refreshTokenExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
    sessionId: 'session-id',
  };
  const transaction = {
    user: {
      create: jest.fn(),
      update: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    authSession: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const passwordService = {
    hash: jest.fn(),
    verifyForAuthentication: jest.fn(),
  };
  const rbacBootstrapService = {
    ensureDefaultUserRole: jest.fn(),
  };
  const tokenService = {
    issueTokenPair: jest.fn(),
    verifyRefreshToken: jest.fn(),
    hashRefreshToken: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.authSession.updateMany.mockResolvedValue({ count: 1 });

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
      tokenService as unknown as TokenService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers a user transactionally with the default role and audit log', async () => {
    const dto: RegisterDto = {
      email: activeUser.email,
      password: 'SecurePassword123!',
      username: activeUser.username,
      phone: activeUser.phone,
      firstName: activeUser.firstName,
      lastName: activeUser.lastName,
    };
    const pendingUser = {
      ...activeUser,
      status: 'PENDING' as const,
      roles: [
        {
          role: {
            name: 'USER',
            status: 'ACTIVE' as const,
            permissions: [],
          },
        },
      ],
    };

    passwordService.hash.mockResolvedValue('argon2-hash');
    rbacBootstrapService.ensureDefaultUserRole.mockResolvedValue({
      id: 'role-id',
      name: 'USER',
    });
    transaction.user.create.mockResolvedValue(pendingUser);

    const result = await service.register(dto, {
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    });

    expect(passwordService.hash).toHaveBeenCalledWith(dto.password);
    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        select: AUTH_USER_SELECT,
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: activeUser.id,
        action: 'CREATE',
        entityType: 'User',
        entityId: activeUser.id,
        description: 'User completed self-registration.',
        metadata: {
          source: 'SELF_REGISTRATION',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });
    expect(result.user).toMatchObject({
      email: activeUser.email,
      status: 'PENDING',
      roles: ['USER'],
      permissions: [],
    });
    expect(JSON.stringify(result)).not.toContain('argon2-hash');
    expect(JSON.stringify(result)).not.toContain(dto.password);
  });

  it('returns a conflict for duplicate user identifiers', async () => {
    const dto: RegisterDto = {
      email: activeUser.email,
      password: 'SecurePassword123!',
    };

    passwordService.hash.mockResolvedValue('argon2-hash');
    rbacBootstrapService.ensureDefaultUserRole.mockResolvedValue({
      id: 'role-id',
      name: 'USER',
    });
    transaction.user.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('logs in an active user and persists an audited refresh session', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    passwordService.verifyForAuthentication.mockResolvedValue(true);
    tokenService.issueTokenPair.mockResolvedValue(issuedTokens);

    const result = await service.login({
      email: activeUser.email,
      password: 'SecurePassword123!',
    });

    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: {
        id: issuedTokens.sessionId,
        userId: activeUser.id,
        refreshTokenHash: issuedTokens.refreshTokenHash,
        expiresAt: issuedTokens.refreshTokenExpiresAt,
      },
    });
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: activeUser.id },
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: activeUser.id,
        action: 'LOGIN',
        entityType: 'AuthSession',
        entityId: issuedTokens.sessionId,
        description: 'User login succeeded.',
        metadata: {
          event: 'SESSION_CREATED',
        },
        ipAddress: undefined,
        userAgent: undefined,
      },
    });
    expect(result).toMatchObject({
      message: 'Login successful.',
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshExpiresIn: 604800,
      accessToken: issuedTokens.accessToken,
      refreshToken: issuedTokens.refreshToken,
      user: {
        id: activeUser.id,
        roles: ['ADMIN'],
      },
    });
  });

  it('returns the same generic login error for unknown and inactive users', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...activeUser,
      status: 'PENDING',
    });
    passwordService.verifyForAuthentication
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      service.login({
        email: 'missing@example.com',
        password: 'submitted-password',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Invalid email or password.',
      },
    });
    await expect(
      service.login({
        email: activeUser.email,
        password: 'submitted-password',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Invalid email or password.',
      },
    });
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('returns the generic login error for an incorrect password', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    passwordService.verifyForAuthentication.mockResolvedValue(false);

    await expect(
      service.login({
        email: activeUser.email,
        password: 'incorrect-password',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Invalid email or password.',
      },
    });
    expect(passwordService.verifyForAuthentication).toHaveBeenCalledWith(
      activeUser.passwordHash,
      'incorrect-password',
    );
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token and revokes the previous session', async () => {
    const rotatedAt = new Date('2026-08-19T06:00:00.000Z');
    jest.useFakeTimers().setSystemTime(rotatedAt);

    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: activeUser.id,
      email: activeUser.email,
      type: 'refresh',
      jti: 'old-session-id',
    });
    tokenService.hashRefreshToken.mockReturnValue('old-token-hash');
    prisma.authSession.findFirst.mockResolvedValue({
      id: 'old-session-id',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser,
    });
    tokenService.issueTokenPair.mockResolvedValue(issuedTokens);

    const result = await service.refresh({ refreshToken: 'old-token' });

    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'old-session-id',
        refreshTokenHash: 'old-token-hash',
        revokedAt: null,
        expiresAt: {
          gt: rotatedAt,
        },
      },
      data: {
        revokedAt: rotatedAt,
        revocationReason: 'ROTATED',
        rotatedToSessionId: issuedTokens.sessionId,
      },
    });
    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: {
        id: issuedTokens.sessionId,
        userId: activeUser.id,
        refreshTokenHash: issuedTokens.refreshTokenHash,
        expiresAt: issuedTokens.refreshTokenExpiresAt,
      },
    });
    expect(result.refreshToken).toBe(issuedTokens.refreshToken);
    expect(result.message).toBe('Session refreshed.');
  });

  it('revokes active sessions when a rotated refresh token is reused', async () => {
    const revokedAt = new Date('2026-08-19T06:00:00.000Z');
    jest.useFakeTimers().setSystemTime(revokedAt);

    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: activeUser.id,
      email: activeUser.email,
      type: 'refresh',
      jti: 'old-session-id',
    });
    tokenService.hashRefreshToken.mockReturnValue('old-token-hash');
    prisma.authSession.findFirst.mockResolvedValue({
      id: 'old-session-id',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: activeUser,
    });

    await expect(
      service.refresh({ refreshToken: 'old-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: activeUser.id,
        revokedAt: null,
      },
      data: {
        revokedAt,
        revocationReason: 'REFRESH_TOKEN_REUSE',
      },
    });
  });

  it('revokes only the expired refresh session', async () => {
    const checkedAt = new Date('2026-08-19T06:00:00.000Z');
    jest.useFakeTimers().setSystemTime(checkedAt);
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: activeUser.id,
      email: activeUser.email,
      type: 'refresh',
      jti: 'expired-session-id',
    });
    tokenService.hashRefreshToken.mockReturnValue('expired-token-hash');
    prisma.authSession.findFirst.mockResolvedValue({
      id: 'expired-session-id',
      userId: activeUser.id,
      expiresAt: new Date(checkedAt.getTime() - 1),
      revokedAt: null,
      user: activeUser,
    });

    await expect(
      service.refresh({ refreshToken: 'expired-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'expired-session-id',
        userId: activeUser.id,
        revokedAt: null,
      },
      data: {
        revokedAt: checkedAt,
        revocationReason: 'REFRESH_TOKEN_EXPIRED',
      },
    });
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
  });

  it('revokes active sessions after a concurrent refresh loses rotation', async () => {
    const rotatedAt = new Date('2026-08-19T06:00:00.000Z');
    jest.useFakeTimers().setSystemTime(rotatedAt);
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: activeUser.id,
      email: activeUser.email,
      type: 'refresh',
      jti: 'old-session-id',
    });
    tokenService.hashRefreshToken.mockReturnValue('old-token-hash');
    prisma.authSession.findFirst.mockResolvedValue({
      id: 'old-session-id',
      userId: activeUser.id,
      expiresAt: new Date(rotatedAt.getTime() + 60_000),
      revokedAt: null,
      user: activeUser,
    });
    tokenService.issueTokenPair.mockResolvedValue(issuedTokens);
    transaction.authSession.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.refresh({ refreshToken: 'old-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(transaction.authSession.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: activeUser.id,
        revokedAt: null,
      },
      data: {
        revokedAt: rotatedAt,
        revocationReason: 'REFRESH_TOKEN_REUSE',
      },
    });
    expect(transaction.authSession.create).not.toHaveBeenCalled();
  });

  it('logs out idempotently and audits the first revocation', async () => {
    const loggedOutAt = new Date('2026-08-19T06:00:00.000Z');
    jest.useFakeTimers().setSystemTime(loggedOutAt);

    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: activeUser.id,
      email: activeUser.email,
      type: 'refresh',
      jti: issuedTokens.sessionId,
    });
    tokenService.hashRefreshToken.mockReturnValue('refresh-token-hash');
    transaction.authSession.findFirst.mockResolvedValue({
      id: issuedTokens.sessionId,
      userId: activeUser.id,
    });
    transaction.authSession.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const firstResult = await service.logout({
      refreshToken: 'refresh-token',
    });
    const secondResult = await service.logout({
      refreshToken: 'refresh-token',
    });

    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: issuedTokens.sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: loggedOutAt,
        revocationReason: 'LOGOUT',
      },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: activeUser.id,
        action: 'LOGOUT',
        entityType: 'AuthSession',
        entityId: issuedTokens.sessionId,
        description: 'User logged out and revoked the refresh session.',
        metadata: {
          event: 'SESSION_REVOKED',
        },
        ipAddress: undefined,
        userAgent: undefined,
      },
    });
    expect(firstResult).toEqual({ message: 'Logout successful.' });
    expect(secondResult).toEqual({ message: 'Logout successful.' });
  });
});
