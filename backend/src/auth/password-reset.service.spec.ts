import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { CommunicationService } from '../communication/communication.service';
import type { PrismaService } from '../database/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { PasswordService } from './password.service';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  const redisStore = new Map<string, string>();

  const redisClient = {
    set: jest.fn(
      async (
        key: string,
        value: string,
        _ex: string,
        _ttl: number,
        nx?: string,
      ) => {
        if (nx === 'NX' && redisStore.has(key)) return null;
        redisStore.set(key, value);
        return 'OK';
      },
    ),
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    del: jest.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (redisStore.delete(key)) count += 1;
      }
      return count;
    }),
    eval: jest.fn(
      async (
        _script: string,
        _numberOfKeys: number,
        tokenKey: string,
        userKey: string,
        expectedHash: string,
      ) => {
        const payload = redisStore.get(tokenKey);
        const currentHash = redisStore.get(userKey);

        if (!payload || currentHash !== expectedHash) {
          return null;
        }

        redisStore.delete(tokenKey);
        redisStore.delete(userKey);
        return payload;
      },
    ),
    multi: jest.fn(() => {
      const operations: Array<() => void> = [];
      const chain = {
        del: (key: string) => {
          operations.push(() => redisStore.delete(key));
          return chain;
        },
        set: (key: string, value: string) => {
          operations.push(() => redisStore.set(key, value));
          return chain;
        },
        exec: async () => {
          operations.forEach((operation) => operation());
          return [];
        },
      };
      return chain;
    }),
  };

  const prisma = {
    user: {
      findMany: jest.fn(),
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

  const redisService = {
    getClient: () => redisClient,
  };

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'PUBLIC_APP_URL') return 'https://app.example.com';
      if (key === 'PASSWORD_RESET_TTL_MINUTES') return 30;
      if (key === 'PASSWORD_RESET_RESEND_COOLDOWN_SECONDS') return 60;
      return undefined;
    }),
  };

  const communicationService = {
    sendEmail: jest.fn().mockResolvedValue({ transport: 'SMTP', accepted: true }),
  };

  const passwordService = {
    verifyForAuthentication: jest.fn().mockResolvedValue(false),
    hash: jest.fn().mockResolvedValue('new-hash'),
  };

  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    redisStore.clear();

    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    communicationService.sendEmail.mockResolvedValue({
      transport: 'SMTP',
      accepted: true,
    });
    passwordService.verifyForAuthentication.mockResolvedValue(false);
    passwordService.hash.mockResolvedValue('new-hash');

    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      redisService as unknown as RedisService,
      configService as unknown as ConfigService,
      communicationService as unknown as CommunicationService,
      passwordService as unknown as PasswordService,
    );
  });

  it('returns a generic response for an unknown account without sending email', async () => {
    await expect(service.request('missing@example.com')).resolves.toEqual({
      message: 'If the account is eligible, a password reset email has been sent.',
    });
    expect(communicationService.sendEmail).not.toHaveBeenCalled();
  });

  it('issues a single-use reset link for one verified active user', async () => {
    prisma.user.findMany.mockResolvedValue([
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

    expect(communicationService.sendEmail).toHaveBeenCalledTimes(1);
    expect(communicationService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset your FixTradeZone password',
        text: expect.stringContaining('https://app.example.com/reset-password?token='),
      }),
    );
    expect(
      [...redisStore.keys()].some((key) => key.includes(':token:')),
    ).toBe(true);
  });

  it('rejects an invalid or expired reset token', async () => {
    await expect(
      service.reset('not-a-valid-token', 'A-different-password-123!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the password, consumes the token and revokes active sessions', async () => {
    prisma.user.findMany.mockResolvedValue([
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

    const tokenCall = communicationService.sendEmail.mock.calls[0]?.[0] as {
      text: string;
    };
    const token = /reset-password\?token=([^\s]+)/.exec(tokenCall.text)?.[1];
    if (!token) throw new Error('Expected reset token in email fixture.');

    prisma.user.findUnique.mockResolvedValue({
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

    expect(redisClient.eval).toHaveBeenCalledTimes(1);
    expect(passwordService.hash).toHaveBeenCalledWith(
      'A-different-password-123!',
    );
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
        data: expect.objectContaining({ revocationReason: 'PASSWORD_RESET' }),
      }),
    );

    await expect(
      service.reset(decodedToken, 'Another-different-password-456!'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
