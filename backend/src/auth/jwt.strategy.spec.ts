import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn().mockReturnValue('a'.repeat(64)),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();

    strategy = new JwtStrategy(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('returns the current active user and active roles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'current@example.com',
      username: 'current.user',
      firstName: 'Current',
      lastName: 'User',
      status: 'ACTIVE',
      roles: [
        { role: { name: 'USER', status: 'ACTIVE' } },
        { role: { name: 'OLD_ROLE', status: 'INACTIVE' } },
      ],
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        email: 'issued@example.com',
        type: 'access',
      }),
    ).resolves.toEqual({
      id: 'user-id',
      email: 'current@example.com',
      username: 'current.user',
      firstName: 'Current',
      lastName: 'User',
      status: 'ACTIVE',
      roles: ['USER'],
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'user-id',
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });
  });

  it('rejects malformed or non-access payloads before querying the database', async () => {
    await expect(
      strategy.validate({
        sub: 'user-id',
        email: 'user@example.com',
        type: 'refresh',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'SUSPENDED', 'BLOCKED'])(
    'rejects a user with %s status',
    async (status) => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        status,
      });

      await expect(
        strategy.validate({
          sub: 'user-id',
          email: 'user@example.com',
          type: 'access',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('rejects a token whose subject no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'missing-user',
        email: 'missing@example.com',
        type: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
