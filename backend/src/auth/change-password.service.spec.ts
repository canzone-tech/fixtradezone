import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { PasswordService } from './password.service';
import { ChangePasswordService } from './change-password.service';

type UserRecord = {
  id: string;
  passwordHash: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
};

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
    updateMany(args: UserUpdateArgs): Promise<{ count: number }>;
  };
  authSession: {
    updateMany(args: SessionUpdateArgs): Promise<{ count: number }>;
  };
  auditLog: {
    create(args: AuditCreateArgs): Promise<{ id: string }>;
  };
};

function asDependency<T>(value: unknown): T {
  return value as T;
}

describe('ChangePasswordService', () => {
  let findUniqueResult: UserRecord | null;
  let updateCount: number;
  let revokedCount: number;
  let verifyResults: boolean[];
  let hashedPassword: string | null;
  let userUpdateArgs: UserUpdateArgs | null;
  let sessionUpdateArgs: SessionUpdateArgs | null;
  let auditCreateArgs: AuditCreateArgs | null;

  const transactionClient: TransactionClient = {
    user: {
      updateMany(args) {
        userUpdateArgs = args;
        return Promise.resolve({ count: updateCount });
      },
    },
    authSession: {
      updateMany(args) {
        sessionUpdateArgs = args;
        return Promise.resolve({ count: revokedCount });
      },
    },
    auditLog: {
      create(args) {
        auditCreateArgs = args;
        return Promise.resolve({ id: 'audit-1' });
      },
    },
  };

  const prisma = {
    user: {
      findUnique(args: unknown): Promise<UserRecord | null> {
        void args;
        return Promise.resolve(findUniqueResult);
      },
    },
    $transaction(
      callback: (tx: TransactionClient) => Promise<void>,
      options?: unknown,
    ): Promise<void> {
      void options;
      return callback(transactionClient);
    },
  };

  const passwordService = {
    verifyForAuthentication(
      passwordHash: string | null,
      password: string,
    ): Promise<boolean> {
      void passwordHash;
      void password;
      return Promise.resolve(verifyResults.shift() ?? false);
    },
    hash(password: string): Promise<string> {
      hashedPassword = password;
      return Promise.resolve('new-hash');
    },
  };

  let service: ChangePasswordService;

  beforeEach(() => {
    findUniqueResult = {
      id: 'user-1',
      passwordHash: 'old-hash',
      status: 'ACTIVE',
    };
    updateCount = 1;
    revokedCount = 2;
    verifyResults = [];
    hashedPassword = null;
    userUpdateArgs = null;
    sessionUpdateArgs = null;
    auditCreateArgs = null;

    service = new ChangePasswordService(
      asDependency<PrismaService>(prisma),
      asDependency<PasswordService>(passwordService),
    );
  });

  it('rejects an incorrect current password', async () => {
    verifyResults = [false];

    await expect(
      service.change('user-1', 'wrong-password', 'New-password-123!'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects reuse of the current password', async () => {
    verifyResults = [true, true];

    await expect(
      service.change(
        'user-1',
        'Current-password-123!',
        'Current-password-123!',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the credential, revokes active sessions and audits success', async () => {
    verifyResults = [true, false];

    await expect(
      service.change('user-1', 'Current-password-123!', 'New-password-123!', {
        ipAddress: '203.0.113.8',
        userAgent: 'jest',
      }),
    ).resolves.toEqual({
      message: 'Password changed successfully. Please sign in again.',
    });

    expect(hashedPassword).toBe('New-password-123!');

    if (!userUpdateArgs) throw new Error('Expected user update call.');
    expect(userUpdateArgs.data.passwordHash).toBe('new-hash');
    expect(userUpdateArgs.data.mustChangePassword).toBe(false);

    if (!sessionUpdateArgs)
      throw new Error('Expected session revocation call.');
    expect(sessionUpdateArgs.data.revocationReason).toBe('PASSWORD_CHANGED');

    if (!auditCreateArgs) throw new Error('Expected audit log call.');
    expect(auditCreateArgs.data.actorUserId).toBe('user-1');
    expect(auditCreateArgs.data.entityType).toBe('UserCredential');
    expect(auditCreateArgs.data.ipAddress).toBe('203.0.113.8');
  });
});
