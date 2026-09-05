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

type UserUpdateArgs = {
  where: { id: string; status: string };
  data: { passwordHash: string; mustChangePassword: boolean };
};

type SessionUpdateArgs = {
  where: { userId: string; revokedAt: null };
  data: { revokedAt: Date; revocationReason: string };
};

type AuditCreateArgs = {
  data: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    description: string;
    metadata: { event: string; revokedSessionCount: number };
    ipAddress?: string;
    userAgent?: string;
  };
};

type TransactionClient = {
  user: {
    updateMany: jest.MockedFunction<
      (args: UserUpdateArgs) => Promise<CountResult>
    >;
  };
  authSession: {
    updateMany: jest.MockedFunction<
      (args: SessionUpdateArgs) => Promise<CountResult>
    >;
  };
  auditLog: {
    create: jest.MockedFunction<(args: AuditCreateArgs) => Promise<AuditResult>>;
  };
};

function asDependency<T>(value: unknown): T {
  return value as T;
}

describe('ChangePasswordService', () => {
  const userFindUnique = jest.fn<
    (args: unknown) => Promise<UserRecord | null>
  >();
  const userUpdateMany = jest.fn<
    (args: UserUpdateArgs) => Promise<CountResult>
  >();
  const authSessionUpdateMany = jest.fn<
    (args: SessionUpdateArgs) => Promise<CountResult>
  >();
  const auditLogCreate = jest.fn<
    (args: AuditCreateArgs) => Promise<AuditResult>
  >();

  const transactionClient: TransactionClient = {
    user: { updateMany: userUpdateMany },
    authSession: { updateMany: authSessionUpdateMany },
    auditLog: { create: auditLogCreate },
  };

  const transaction = jest.fn<
    (
      callback: (tx: TransactionClient) => Promise<void>,
      options?: unknown,
    ) => Promise<void>
  >((callback) => callback(transactionClient));

  const prisma = {
    user: {
      findUnique: userFindUnique,
    },
    $transaction: transaction,
  };

  const verifyForAuthentication = jest.fn<
    (passwordHash: string | null, password: string) => Promise<boolean>
  >();
  const hash = jest.fn<(password: string) => Promise<string>>();

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

    const updateArgs = userUpdateMany.mock.calls[0]?.[0];
    if (!updateArgs) throw new Error('Expected user update call.');
    expect(updateArgs.data.passwordHash).toBe('new-hash');
    expect(updateArgs.data.mustChangePassword).toBe(false);

    const revokeArgs = authSessionUpdateMany.mock.calls[0]?.[0];
    if (!revokeArgs) throw new Error('Expected session revocation call.');
    expect(revokeArgs.data.revocationReason).toBe('PASSWORD_CHANGED');

    const auditArgs = auditLogCreate.mock.calls[0]?.[0];
    if (!auditArgs) throw new Error('Expected audit log call.');
    expect(auditArgs.data.actorUserId).toBe('user-1');
    expect(auditArgs.data.entityType).toBe('UserCredential');
    expect(auditArgs.data.ipAddress).toBe('203.0.113.8');
  });
});
