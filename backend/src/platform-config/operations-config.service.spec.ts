import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { OperationsConfigService } from './operations-config.service';

const SUPER_ADMIN_ID = '11111111-1111-4111-8111-111111111111';

function actor(roles: string[]): AuthenticatedUser {
  return {
    id: SUPER_ADMIN_ID,
    email: 'founder@example.com',
    username: 'founder',
    phone: null,
    firstName: 'Founder',
    lastName: 'User',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-28T00:00:00.000Z'),
    lastLoginAt: null,
    roles,
    permissions: [],
  };
}

describe('OperationsConfigService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  let service: OperationsConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsConfigService(prisma as unknown as PrismaService);
  });

  it('defaults to UTC and AUTOMATIC when the singleton row is absent', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.getOperations()).resolves.toEqual({
      platformTimezone: 'UTC',
      operationsMode: 'AUTOMATIC',
      updatedAt: null,
    });
  });

  it('rejects any non-UTC platform timezone', async () => {
    await expect(
      service.updateOperations(
        {
          platformTimezone: 'Asia/Kolkata' as 'UTC',
          operationsMode: 'AUTOMATIC',
        },
        actor(['SUPER_ADMIN']),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects operations mutation outside SUPER_ADMIN', async () => {
    await expect(
      service.updateOperations(
        {
          platformTimezone: 'UTC',
          operationsMode: 'CONTROLLED_MANUAL',
        },
        actor(['ADMIN']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('makes Platform Mode the only mutation path for automation state', async () => {
    await expect(
      service.updateOperations(
        {
          platformTimezone: 'UTC',
          operationsMode: 'CONTROLLED_MANUAL',
        },
        actor(['SUPER_ADMIN']),
      ),
    ).rejects.toMatchObject({
      response: {
        message:
          'Operations mode is controlled by Platform Mode. Use /admin/settings/site-mode.',
      },
    });
  });
});
