import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { PasswordService } from './password.service';
import { ChangePasswordService } from './change-password.service';

describe('ChangePasswordService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    authSession: {
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  };

  const passwordService = {
    verifyForAuthentication: jest.fn(),
    hash: jest.fn(),
  };

  let service: ChangePasswordService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
      status: 'ACTIVE',
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    passwordService.verifyForAuthentication.mockResolvedValue(false);
    passwordService.hash.mockResolvedValue('new-hash');

    service = new ChangePasswordService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
    );
  });

  it('rejects an incorrect current password', async () => {
    passwordService.verifyForAuthentication.mockResolvedValueOnce(false);

    await expect(
      service.change('user-1', 'wrong-password', 'New-password-123!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects reuse of the current password', async () => {
    passwordService.verifyForAuthentication
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await expect(
      service.change('user-1', 'Current-password-123!', 'Current-password-123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the credential, revokes active sessions and audits success', async () => {
    passwordService.verifyForAuthentication
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      service.change(
        'user-1',
        'Current-password-123!',
        'New-password-123!',
        { ipAddress: '203.0.113.8', userAgent: 'jest' },
      ),
    ).resolves.toEqual({
      message: 'Password changed successfully. Please sign in again.',
    });

    expect(passwordService.hash).toHaveBeenCalledWith('New-password-123!');
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: false,
        }),
      }),
    );
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revocationReason: 'PASSWORD_CHANGED' }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'user-1',
          entityType: 'UserCredential',
          ipAddress: '203.0.113.8',
        }),
      }),
    );
  });
});
