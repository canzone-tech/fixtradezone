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

type CountResult = { count: number };
type AuditResult = { id: string };

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type EmailResult = {
  transport: string;
  accepted: boolean;
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

type RedisMulti = {
  del(key: string): RedisMulti;
  set(key: string, value: string, mode?: string, ttl?: number): RedisMulti;
  exec(): Promise<unknown[]>;
};

function asDependency<T>(value: unknown): T {
  return value as T;
}

describe('PasswordResetService', () => {
  const redisStore = new Map<string, string>();

  const redisSet = jest.fn<
    (
      key: string,
      value: string,
      mode: string,
      ttl: number,
      nx?: string,
    ) => Promise<string | null>
  >((key, value, ...options) => {
    const nx = options.at(-1) === 'NX' ? 'NX' : undefined;
    if (nx === 'NX' && redisStore.has(key)) return Promise.resolve(null);
    redisStore.set(key, value);
    return Promise.resolve('OK');
  });

  const redisGet = jest.fn<(key: string) => Promise<string | null>>((key) =>
    Promise.resolve(redisStore.get(key) ?? null),
  );

  const redisDel = jest.fn<(...keys: string[]) => Promise<number>>((...keys) => {
    let count = 0;
    for (const key of keys) {
      if (redisStore.delete(key)) count += 1;
    }
    return Promise.resolve(count);
  });

  const redisEval = jest.fn<
    (
      script: string,
      numberOfKeys: number,
      tokenKey: string,
      userKey: string,
      expectedHash: string,
    ) => Promise<string | null>
  >((...args) => {
    const tokenKey = args[2];
    const userKey = args[3];
    const expectedHash = args[4];
    const payload = redisStore.get(tokenKey);
    const currentHash = redisStore.get(userKey);

    if (!payload || currentHash !== expectedHash) {
      return Promise.resolve(null);
    }

    redisStore.delete(tokenKey);
    redisStore.delete(userKey);
    return Promise.resolve(payload);
  });

  const redisMulti = jest.fn((): RedisMulti => {
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
  });

  const redisClient = {
    set: redisSet,
    get: redisGet,
    del: redisDel,
    eval: redisEval,
    multi: redisMulti,
  };

  const userFindMany = jest.fn<
    (args: unknown) => Promise<RequestUser[]>
  >();
  const userFindUnique = jest.fn<
    (args: unknown) => Promise<ResetUser | null>
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
      findMany: userFindMany,
      findUnique: userFindUnique,
    },
    auditLog: {
      create: auditLogCreate,
    },
    $transaction: transaction,
  };

  const redisService = {
    getClient: () => redisClient,
  };

  const configGet = jest.fn((key: string): unknown => {
    if (key === 'PUBLIC_APP_URL') return 'https://app.example.com';
    if (key === 'PASSWORD_RESET_TTL_MINUTES') return 30;
    if (key === 'PASSWORD_RESET_RESEND_COOLDOWN_SECONDS') return 60;
    return undefined;
  });
  const configService = {
    get: configGet,
  };

  const sendEmail = jest.fn<(message: EmailMessage) => Promise<EmailResult>>();
  const communicationService = {
    sendEmail,
  };

  const verifyForAuthentication = jest.fn<
    (passwordHash: string | null, password: string) => Promise<boolean>
  >();
  const hash = jest.fn<(password: string) => Promise<string>>();
  const passwordService = {
    verifyForAuthentication,
    hash,
  };

  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    redisStore.clear();

    userFindMany.mockResolvedValue([]);
    userFindUnique.mockResolvedValue(null);
    userUpdateMany.mockResolvedValue({ count: 1 });
    authSessionUpdateMany.mockResolvedValue({ count: 2 });
    auditLogCreate.mockResolvedValue({ id: 'audit-1' });
    sendEmail.mockResolvedValue({
      transport: 'SMTP',
      accepted: true,
    });
    verifyForAuthentication.mockResolvedValue(false);
    hash.mockResolvedValue('new-hash');

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
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('issues a single-use reset link for one verified active user', async () => {
    userFindMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    ]);

    await expect(service.request('USER@example.com')).resolves.toEqual({
      message: 'If the account is eligible, a password reset email has been sent.',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const issuedEmail = sendEmail.mock.calls[0]?.[0];
    if (!issuedEmail) throw new Error('Expected password reset email fixture.');
    expect(issuedEmail.to).toBe('user@example.com');
    expect(issuedEmail.subject).toBe('Reset your FixTradeZone password');
    expect(issuedEmail.text).toContain(
      'https://app.example.com/reset-password?token=',
    );
    expect(
      [...redisStore.keys()].some((key) => key.includes(':token:')),
    ).toBe(true);

    const issuedAudit = auditLogCreate.mock.calls.find(
      ([args]) => args.data.entityType === 'PasswordReset',
    );
    expect(issuedAudit).toBeDefined();
  });

  it('rejects an invalid or expired reset token', async () => {
    await expect(
      service.reset('not-a-valid-token', 'A-different-password-123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password, consumes the token and revokes active sessions', async () => {
    userFindMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        emailVerifiedAt: new Date(),
        status: 'ACTIVE',
      },
    ]);

    await service.request('user@example.com');

    const tokenCall = sendEmail.mock.calls[0]?.[0];
    if (!tokenCall) throw new Error('Expected password reset email fixture.');

    const token = /reset-password\?token=([^\s]+)/.exec(tokenCall.text)?.[1];
    if (!token) throw new Error('Expected reset token in email fixture.');

    userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      passwordHash: 'old-hash',
      status: 'ACTIVE',
    });

    const decodedToken = decodeURIComponent(token);

    await expect(
      service.reset(decodedToken, 'A-different-password-123!'),
    ).resolves.toEqual({
      message: 'Password reset successfully. Please sign in with your new password.',
    });

    expect(redisEval).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledWith('A-different-password-123!');

    const updateArgs = userUpdateMany.mock.calls[0]?.[0];
    if (!updateArgs) throw new Error('Expected user update call.');
    expect(updateArgs.data.passwordHash).toBe('new-hash');
    expect(updateArgs.data.mustChangePassword).toBe(false);

    const revokeArgs = authSessionUpdateMany.mock.calls[0]?.[0];
    if (!revokeArgs) throw new Error('Expected session revocation call.');
    expect(revokeArgs.data.revocationReason).toBe('PASSWORD_RESET');

    await expect(
      service.reset(decodedToken, 'Another-different-password-456!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
