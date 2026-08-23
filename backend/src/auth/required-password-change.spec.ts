import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';

describe('Required password change flow', () => {
  const fixedNow = new Date('2026-08-22T12:00:00.000Z');
  const user = {
    id: 'user-id',
    email: 'user@example.com',
    username: 'trader.one',
    phone: '+919876543210',
    firstName: 'Prashant',
    lastName: 'Shukla',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-22T00:00:00.000Z'),
    lastLoginAt: null,
    passwordHash: 'temporary-password-hash',
    mustChangePassword: true,
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

  const transaction = {
    user: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    systemAuthConfig: {
      findUnique: jest.fn(),
    },
    systemRegistrationConfig: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  const passwordService = {
    verifyForAuthentication: jest.fn(),
    hash: jest.fn(),
  };

  const registrationService = {
    registerPublic: jest.fn(),
  };

  const tokenService = {
    issueTokenPair: jest.fn(),
    issuePasswordChangeToken: jest.fn(),
    verifyPasswordChangeToken: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(fixedNow);

    prisma.systemAuthConfig.findUnique.mockResolvedValue(null);
    prisma.systemRegistrationConfig.findUnique.mockResolvedValue(null);

    transaction.authSession.updateMany.mockResolvedValue({
      count: 0,
    });

    transaction.user.updateMany.mockResolvedValue({
      count: 1,
    });

    transaction.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    passwordService.hash.mockResolvedValue('new-password-hash');

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      registrationService as unknown as RegistrationService,
      tokenService as unknown as TokenService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not issue a normal session when a temporary password must be changed', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    passwordService.verifyForAuthentication.mockResolvedValue(true);

    tokenService.issuePasswordChangeToken.mockResolvedValue({
      passwordChangeToken: 'password-change-token',
      expiresAt: new Date('2026-08-22T00:10:00.000Z'),
      expiresIn: 600,
    });

    await expect(
      service.login({
        identifier: user.username,
        password: 'TemporaryPassword123!',
      }),
    ).resolves.toEqual({
      message: 'Password change required.',
      passwordChangeRequired: true,
      passwordChangeToken: 'password-change-token',
      expiresIn: 600,
      user: {
        id: user.id,
        username: user.username,
      },
    });

    expect(tokenService.issuePasswordChangeToken).toHaveBeenCalledWith(user);

    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();

    expect(transaction.authSession.create).not.toHaveBeenCalled();

    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: fixedNow,
        revocationReason: 'PASSWORD_CHANGE_REQUIRED',
      },
    });
  });

  it('atomically changes the required password, clears the flag and revokes sessions', async () => {
    tokenService.verifyPasswordChangeToken.mockResolvedValue({
      sub: user.id,
      type: 'password_change',
      jti: 'challenge-id',
    });

    prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      passwordHash: user.passwordHash,
      mustChangePassword: true,
      status: 'ACTIVE',
    });

    passwordService.verifyForAuthentication.mockResolvedValue(false);

    transaction.authSession.updateMany.mockResolvedValue({
      count: 2,
    });

    await expect(
      service.changeRequiredPassword(
        {
          passwordChangeToken: 'password-change-token',
          newPassword: 'NewSecurePassword123!',
        },
        {
          ipAddress: '127.0.0.1',
          userAgent: 'Jest',
        },
      ),
    ).resolves.toEqual({
      message: 'Password changed successfully. Please sign in again.',
    });

    expect(passwordService.hash).toHaveBeenCalledWith('NewSecurePassword123!');

    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: user.id,
        status: 'ACTIVE',
        mustChangePassword: true,
      },
      data: {
        passwordHash: 'new-password-hash',
        mustChangePassword: false,
      },
    });

    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: fixedNow,
        revocationReason: 'PASSWORD_CHANGED',
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: user.id,
        action: 'UPDATE',
        entityType: 'UserCredential',
        entityId: user.id,
        description: 'User completed required password change.',
        metadata: {
          event: 'REQUIRED_PASSWORD_CHANGED',
          revokedSessionCount: 2,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects reuse of the current temporary password', async () => {
    tokenService.verifyPasswordChangeToken.mockResolvedValue({
      sub: user.id,
      type: 'password_change',
      jti: 'challenge-id',
    });

    prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      passwordHash: user.passwordHash,
      mustChangePassword: true,
      status: 'ACTIVE',
    });

    passwordService.verifyForAuthentication.mockResolvedValue(true);

    await expect(
      service.changeRequiredPassword({
        passwordChangeToken: 'password-change-token',
        newPassword: 'TemporaryPassword123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(passwordService.hash).not.toHaveBeenCalled();
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a replayed password-change token after the flag has been cleared', async () => {
    tokenService.verifyPasswordChangeToken.mockResolvedValue({
      sub: user.id,
      type: 'password_change',
      jti: 'challenge-id',
    });

    prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      passwordHash: 'new-password-hash',
      mustChangePassword: false,
      status: 'ACTIVE',
    });

    await expect(
      service.changeRequiredPassword({
        passwordChangeToken: 'password-change-token',
        newPassword: 'AnotherSecurePassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent password-change request that loses the atomic update', async () => {
    tokenService.verifyPasswordChangeToken.mockResolvedValue({
      sub: user.id,
      type: 'password_change',
      jti: 'challenge-id',
    });

    prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      passwordHash: user.passwordHash,
      mustChangePassword: true,
      status: 'ACTIVE',
    });

    passwordService.verifyForAuthentication.mockResolvedValue(false);

    transaction.user.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.changeRequiredPassword({
        passwordChangeToken: 'password-change-token',
        newPassword: 'NewSecurePassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
