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
  const transaction = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: OperationsConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsConfigService(prisma as unknown as PrismaService);
  });

  it('defaults to Asia/Kolkata and AUTOMATIC when the singleton row is absent', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.getOperations()).resolves.toEqual({
      platformTimezone: 'Asia/Kolkata',
      operationsMode: 'AUTOMATIC',
      updatedAt: null,
    });
  });

  it('rejects invalid IANA timezone values', async () => {
    await expect(
      service.updateOperations(
        {
          platformTimezone: 'Not/A_Real_Timezone',
          operationsMode: 'AUTOMATIC',
        },
        actor(['SUPER_ADMIN']),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects operations mutation outside SUPER_ADMIN', async () => {
    await expect(
      service.updateOperations(
        {
          platformTimezone: 'Asia/Kolkata',
          operationsMode: 'CONTROLLED_MANUAL',
        },
        actor(['ADMIN']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('atomically updates operations and synchronizes legacy accounting mode', async () => {
    const previousUpdatedAt = new Date('2026-08-28T01:00:00.000Z');
    const currentUpdatedAt = new Date('2026-08-28T01:05:00.000Z');

    transaction.$queryRaw
      .mockResolvedValueOnce([
        {
          platformTimezone: 'Asia/Kolkata',
          operationsMode: 'AUTOMATIC',
          updatedAt: previousUpdatedAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          platformTimezone: 'America/New_York',
          operationsMode: 'CONTROLLED_MANUAL',
          updatedAt: currentUpdatedAt,
        },
      ]);
    transaction.$executeRaw.mockResolvedValue(1);

    await expect(
      service.updateOperations(
        {
          platformTimezone: 'America/New_York',
          operationsMode: 'CONTROLLED_MANUAL',
        },
        actor(['SUPER_ADMIN']),
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
      ),
    ).resolves.toEqual({
      message: 'Operations configuration updated.',
      platformTimezone: 'America/New_York',
      operationsMode: 'CONTROLLED_MANUAL',
      updatedAt: currentUpdatedAt,
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: SUPER_ADMIN_ID,
        action: 'UPDATE',
        entityType: 'SystemOperationsConfig',
        entityId: '1',
        description:
          'SUPER_ADMIN updated platform timezone and operations automation mode.',
        metadata: {
          source: 'ADMIN_OPERATIONS_CONFIG',
          previous: {
            platformTimezone: 'Asia/Kolkata',
            operationsMode: 'AUTOMATIC',
          },
          current: {
            platformTimezone: 'America/New_York',
            operationsMode: 'CONTROLLED_MANUAL',
          },
          synchronizedDepositPostingMode: 'MANUAL_RECONCILIATION',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });
  });
});
