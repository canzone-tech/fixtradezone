import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn().mockReturnValue('access-secret-with-at-least-32-characters'),
  };
  const prisma = {
    authSession: {
      findUnique: jest.fn(),
    },
  };
  const activeUser = {
    id: 'user-id',
    email: 'user@example.com',
    username: null,
    phone: null,
    firstName: 'Prashant',
    lastName: 'Shukla',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-18T00:00:00.000Z'),
    lastLoginAt: null,
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

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('loads and returns the current active user from the database', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser,
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        type: 'access',
        sid: 'session-id',
      }),
    ).resolves.toMatchObject({
      id: activeUser.id,
      roles: ['ADMIN'],
      permissions: [],
    });
  });

  it('rejects access tokens when the user is no longer active', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        ...activeUser,
        status: 'BLOCKED',
      },
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        type: 'access',
        sid: 'session-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects malformed or non-access payloads before querying the database', async () => {
    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        type: 'refresh',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token when the account email no longer matches', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser,
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: 'stale@example.com',
        type: 'access',
        sid: 'session-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects access tokens for revoked sessions', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user: activeUser,
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        type: 'access',
        sid: 'session-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects access tokens for expired sessions', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: activeUser.id,
      expiresAt: new Date(Date.now() - 1),
      revokedAt: null,
      user: activeUser,
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        type: 'access',
        sid: 'session-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects access tokens whose session belongs to another user', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: 'different-user-id',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser,
    });

    await expect(
      strategy.validate({
        sub: activeUser.id,
        email: activeUser.email,
        type: 'access',
        sid: 'session-id',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
