import { ConfigService } from '@nestjs/config';
import { CommunicationService } from '../communication/communication.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService pending link state', () => {
  const pendingUser = {
    id: 'pending-user-id',
    email: 'pending@example.com',
    emailVerifiedAt: null,
    status: 'PENDING' as const,
  };

  const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const redis = {
    ttl: jest.fn(),
  };
  const redisService = {
    getClient: jest.fn(() => redis),
  };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'EMAIL_VERIFICATION_TTL_MINUTES' ? 30 : undefined,
    ),
  };

  let service: EmailVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([pendingUser]);
    prisma.user.findUnique.mockResolvedValue(pendingUser);
    redis.ttl.mockResolvedValue(1200);

    service = new EmailVerificationService(
      prisma as unknown as PrismaService,
      redisService as unknown as RedisService,
      configService as unknown as ConfigService,
      {} as CommunicationService,
    );
  });

  it('blocks resend while the current verification link is still active', async () => {
    await expect(
      service.getPendingLinkState('Pending@Example.com'),
    ).resolves.toEqual({
      canResend: false,
      expiresIn: 1200,
      verificationTtlSeconds: 1800,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'pending@example.com' },
        take: 2,
      }),
    );
    expect(redis.ttl).toHaveBeenCalledWith(
      'ftz:auth:email-verification:user:pending-user-id',
    );
  });

  it('allows resend only after the current verification link has expired', async () => {
    redis.ttl.mockResolvedValue(-2);

    await expect(
      service.getPendingLinkState('pending@example.com'),
    ).resolves.toEqual({
      canResend: true,
      expiresIn: 0,
      verificationTtlSeconds: 1800,
    });
  });

  it('supports pending login performed with the username without exposing email', async () => {
    await expect(service.getPendingLinkState('PENDING.USER')).resolves.toEqual({
      canResend: false,
      expiresIn: 1200,
      verificationTtlSeconds: 1800,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: 'pending.user' },
      }),
    );
  });
});
