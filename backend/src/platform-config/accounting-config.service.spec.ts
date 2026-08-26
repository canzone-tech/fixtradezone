import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { AccountingConfigService } from './accounting-config.service';

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
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    lastLoginAt: null,
    roles,
    permissions: [],
  };
}

describe('AccountingConfigService', () => {
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

  let service: AccountingConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountingConfigService(prisma as unknown as PrismaService);
  });

  it('defaults to automatic posting when configuration has not been materialized yet', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.getAccounting()).resolves.toEqual({
      depositPostingMode: 'AUTO_ON_APPROVAL',
      updatedAt: null,
    });
  });

  it('rejects policy mutation outside SUPER_ADMIN', async () => {
    await expect(
      service.updateAccounting(
        { depositPostingMode: 'MANUAL_RECONCILIATION' },
        actor(['ADMIN']),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits SUPER_ADMIN policy changes with previous and current values', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([
        {
          depositPostingMode: 'AUTO_ON_APPROVAL',
          updatedAt: new Date('2026-08-26T01:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          depositPostingMode: 'MANUAL_RECONCILIATION',
          updatedAt: new Date('2026-08-26T01:05:00.000Z'),
        },
      ]);
    transaction.$executeRaw.mockResolvedValue(1);

    const result = await service.updateAccounting(
      { depositPostingMode: 'MANUAL_RECONCILIATION' },
      actor(['SUPER_ADMIN']),
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.depositPostingMode).toBe('MANUAL_RECONCILIATION');
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: SUPER_ADMIN_ID,
        entityType: 'SystemAccountingConfig',
        metadata: expect.objectContaining({
          previous: { depositPostingMode: 'AUTO_ON_APPROVAL' },
          current: { depositPostingMode: 'MANUAL_RECONCILIATION' },
        }),
      }),
    });
  });
});
