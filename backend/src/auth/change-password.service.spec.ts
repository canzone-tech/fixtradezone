import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { PasswordService } from './password.service';
import { ChangePasswordService } from './change-password.service';

type UserRecord = {
  id: string;
  passwordHash: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
};

type CountResult = { count: number };
type AuditResult = { id: string };

type TransactionClient = {
  user: {
    updateMany: jest.MockedFunction<
      (args: unknown) => Promise<CountResult>
    >;
  };
  authSession: {
    updateMany: jest.MockedFunction<
      (args: unknown) => Promise<CountResult>
    >;
  };
  auditLog: {
    create: jest.MockedFunction<(args: unknown) => Promise<AuditResult>>;
  };
};

function asDependency<T>(value: unknown): T {
  return value as T;
}

describe('ChangePasswordService', () => {
  const userFindUnique = jest.fn(
    (_args: unknown): Promise<UserRecord | null> => Promise.resolve(null),
  );
  const userUpdateMany = jest.fn(
    (_args: unknown): Promise<CountResult> => Promise.resolve({ count: 1 }),
  );
  const authSessionUpdateMany = jest.fn(
    (_args: unknown): Promise<CountResult> => Promise.resolve({ count: 0 }),
  );
  const auditLogCreate = jest.fn(
    (_args: unknown): Promise<AuditResult> => Promise.resolve({ id: 'audit-1' }),
  );

  const transactionClient: TransactionClient = {
    user: { updateMany: userUpdateMany },
    authSession: { updateMany: authSessionUpdateMany },
    auditLog: { create: auditLogCreate },
  };

  const transaction = jest.fn(
    (
      callback: (tx: TransactionClient) => Promise<void>,
      _options?: unknown,
    ): Promise<void> => callback(transactionClient),
  );

  const prisma = {
    user: {
      findUnique: userFindUnique,
    },
    $transaction: transaction,
  };

  const verifyForAuthentication = jest.fn(
    (_passwordHash: string | null, _password: string): Promise<boolean> =>
      Promise.resolve(false),
  );
  const hash = jest.fn(
    (_password: string): Promise<string> => Promise.resolve('new-hash'),
  );

  const passwordService = {
    verifyForAuthentication,
    hash,
  };

  let service: ChangePasswordService;

  beforeEach(() => {
    jest.clearAllMocks();
    userFindUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
      status: 'ACTIVE',
    });
    userUpdateMany.mockResolvedValue({ count: 1 });
    authSessionUpdateMany.mockResolvedValue({ count: 2 });
    auditLogCreate.mockResolvedValue({ id: 'audit-1' });
    verifyForAuthentication.mockResolvedValue(false);
    hash.mockResolvedValue('new-hash');

    service = new ChangePasswordService(
      asDependency<PrismaService>(prisma),
      asDependency<PasswordService>(passwordService),
    );
  });

  it('rejects an incorrect current password', async () => {
    verifyForAuthentication.mockResolvedValueOnce(false);

    await expect(
      service.change('user-1', 'wrong-password', 'New-password-123!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects reuse of the current password', async () => {
    verifyForAuthentication.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await expect(
      service.change('user-1', 'Current-password-123!', 'Current-password-123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the credential, revokes active sessions and audits success', async () => {
    verifyForAuthentication.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

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

    expect(hash).toHaveBeenCalledWith('New-password-123!');
    expect(userUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: false,
        }),
      }),
    );
    expect(authSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revocationReason: 'PASSWORD_CHANGED' }),
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith(
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
