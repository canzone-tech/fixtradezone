import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { CommunicationService } from '../communication/communication.service';
import type { PrismaService } from '../database/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';

type RequestUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: Date;
  status: 'ACTIVE';
};

type ResetUser = {
  id: string;
  email: string;
  emailVerifiedAt: Date;
  passwordHash: string | null;
  status: 'ACTIVE';
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
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
    metadata: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  };
};

type RedisMulti = {
  del(key: string): RedisMulti;
  set(key: string, value: string, mode?: string, ttl?: number): RedisMulti;
  exec(): Promise<unknown[]>;
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

describe('PasswordResetService', () => {
  const redisStore = new Map<string, string>();
  const emailMessages: EmailMessage[] = [];
  const auditInputs: AuditCreateArgs[] = [];

  let requestUsers: RequestUser[];
  let resetUser: ResetUser | null;
  let verifyResults: boolean[];
  let hashedPassword: string | null;
  let userUpdateArgs: UserUpdateArgs | null;
  let sessionUpdateArgs: SessionUpdateArgs | null;
  let redisEvalCount: number;

  const redisClient = {
    set(
      key: string,
      value: string,
      mode: string,
      ttl: number,
      nx?: string,
    ): Promise<string | null> {
      void mode;
      void ttl;
      if (nx === 'NX' && redisStore.has(key)) return Promise.resolve(null);
      redisStore.set(key, value);
      return Promise.resolve('OK');
    },
    get(key: string): Promise<string | null> {
      return Promise.resolve(redisStore.get(key) ?? null);
    },
    del(...keys: string[]): Promise<number> {
      let count = 0;
      for (const key of keys) {
        if (redisStore.delete(key)) count += 1;
      }
      return Promise.resolve(count);
    },
    eval(
      script: string,
      numberOfKeys: number,
      tokenKey: string,
      userKey: string,
      expectedHash: string,
    ): Promise<string | null> {
      void script;
      void numberOfKeys;
      redisEvalCount += 1;
      const payload = redisStore.get(tokenKey);
      const currentHash = redisStore.get(userKey);
      if (!payload || currentHash !== expectedHash) return Promise.resolve(null);
      redisStore.delete(tokenKey);
      redisStore.delete(userKey);
      return Promise.resolve(payload);
    },
    multi(): RedisMulti {
      const operations: Array<() => void> = [];
      const chain: RedisMulti = {
        del(key: string) {
          operations.push(() => {
            redisStore.delete(key);
          });
          return chain;
        },
        set(key: string, value: string) {
          operations.push(() => {
            redisStore.set(key, value);
          });
          return chain;
        },
        exec() {
          operations.forEach((operation) => operation());
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };

  const transactionClient: TransactionClient = {
    user: {
      updateMany(args) {
        userUpdateArgs = args;
        return Promise.resolve({ count: 1 });
      },
    },
    authSession: {
      updateMany(args) {
        sessionUpdateArgs = args;
        return Promise.resolve({ count: 2 });
      },
    },
    auditLog: {
      create(args) {
        auditInputs.push(args);
        return Promise.resolve({ id: 'audit-tx' });
      },
    },
  };

  const prisma = {
    user: {
      findMany(args: unknown): Promise<RequestUser[]> {
        void args;
        return Promise.resolve(requestUsers);
      },
      findUnique(args: unknown): Promise<ResetUser | null> {
        void args;
        return Promise.resolve(resetUser);
      },
    },
    auditLog: {
      create(args: AuditCreateArgs): Promise<{ id: string }> {
        auditInputs.push(args);
        return Promise.resolve({ id: 'audit-direct' });
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

  const redisService = {
    getClient() {
      return redisClient;
    },
  };

  const configService = {
    get(key: string): unknown {
      if (key === 'PUBLIC_APP_URL') return 'https://app.example.com';
      if (key === 'PASSWORD_RESET_TTL_MINUTES') return 30;
      if (key === 'PASSWORD_RESET_RESEND_COOLDOWN_SECONDS') return 60;
      return undefined;
    },
  };

  const communicationService = {
    sendEmail(message: EmailMessage): Promise<{ transport: string; accepted: boolean }> {
      emailMessages.push(message);
      return Promise.resolve({ transport: 'SMTP', accepted: true });
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

  let service: PasswordResetService;

  beforeEach(() => {
    redisStore.clear();
    emailMessages.length = 0;
    auditInputs.length = 0;
    requestUsers = [];
    resetUser = null;
    verifyResults = [];
    hashedPassword = null;
    userUpdateArgs = null;
    sessionUpdateArgs = null;
    redisEvalCount = 0;

    service = new PasswordResetService(
      asDependency<PrismaService>(prisma),
      asDependency<RedisService>(redisService),
      asDependency<ConfigService>(configService),
      asDependency<CommunicationService>(communicationService),
      asDependency<PasswordService>(passwordService),
    );
  });

  it('returns a generic response for an unknown account without sending email', async () => {
    await expect(service.request('missing@example.com')).resolves.toEqual({
      message: 'If the account is eligible, a password reset email has been sent.',
    });
    expect(emailMessages).toHaveLength(0);
  });

  it('issues a single-use reset link for one verified active user', async () => {
    requestUsers = [
      {
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    ];

    await expect(service.request('USER@example.com')).resolves.toEqual({
      message: 'If the account is eligible, a password reset email has been sent.',
    });

    expect(emailMessages).toHaveLength(1);
    const issuedEmail = emailMessages[0];
    if (!issuedEmail) throw new Error('Expected password reset email fixture.');
    expect(issuedEmail.to).toBe('user@example.com');
    expect(issuedEmail.subject).toBe('Reset your FixTradeZone password');
    expect(issuedEmail.text).toContain(
      'https://app.example.com/reset-password?token=',
    );
    expect(
      [...redisStore.keys()].some((key) => key.includes(':token:')),
    ).toBe(true);
    expect(
      auditInputs.some((entry) => entry.data.entityType === 'PasswordReset'),
    ).toBe(true);
  });

  it('rejects an invalid or expired reset token', async () => {
    await expect(
      service.reset('not-a-valid-token', 'A-different-password-123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password, consumes the token and revokes active sessions', async () => {
    requestUsers = [
      {
        id: 'user-1',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    ];

    await service.request('user@example.com');

    const tokenEmail = emailMessages[0];
    if (!tokenEmail) throw new Error('Expected password reset email fixture.');
    const token = /reset-password\?token=([^\s]+)/.exec(tokenEmail.text)?.[1];
    if (!token) throw new Error('Expected reset token in email fixture.');

    resetUser = {
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      passwordHash: 'old-hash',
      status: 'ACTIVE',
    };
    verifyResults = [false];

    const decodedToken = decodeURIComponent(token);
    await expect(
      service.reset(decodedToken, 'A-different-password-123!'),
    ).resolves.toEqual({
      message: 'Password reset successfully. Please sign in with your new password.',
    });

    expect(redisEvalCount).toBe(1);
    expect(hashedPassword).toBe('A-different-password-123!');

    if (!userUpdateArgs) throw new Error('Expected user update call.');
    expect(userUpdateArgs.data.passwordHash).toBe('new-hash');
    expect(userUpdateArgs.data.mustChangePassword).toBe(false);

    if (!sessionUpdateArgs) throw new Error('Expected session revocation call.');
    expect(sessionUpdateArgs.data.revocationReason).toBe('PASSWORD_RESET');

    await expect(
      service.reset(decodedToken, 'Another-different-password-456!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
