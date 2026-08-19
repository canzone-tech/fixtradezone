import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FounderAdminBootstrapService } from './founder-admin-bootstrap.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

describe('FounderAdminBootstrapService', () => {
  const transaction = {
    userRole: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const rbacBootstrapService = {
    ensureAdminRole: jest.fn(),
  };

  let service: FounderAdminBootstrapService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FounderAdminBootstrapService(
      prisma as unknown as PrismaService,
      rbacBootstrapService as unknown as RbacBootstrapService,
    );
  });

  it('assigns and audits the only founder ADMIN role', async () => {
    rbacBootstrapService.ensureAdminRole.mockResolvedValue({
      id: 'admin-role-id',
      name: 'ADMIN',
    });
    transaction.userRole.findFirst.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'founder@example.com',
      status: 'PENDING',
    });

    const result = await service.bootstrap(' Founder@Example.COM ');

    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'founder@example.com' },
      select: { id: true, email: true, status: true },
    });
    expect(transaction.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: 'user-id',
          roleId: 'admin-role-id',
        },
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: 'user-id',
      email: 'founder@example.com',
      status: 'ACTIVE',
      roles: ['ADMIN'],
    });
  });

  it('refuses to create a second bootstrap administrator', async () => {
    rbacBootstrapService.ensureAdminRole.mockResolvedValue({
      id: 'admin-role-id',
      name: 'ADMIN',
    });
    transaction.userRole.findFirst.mockResolvedValue({ userId: 'existing' });

    await expect(
      service.bootstrap('founder@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
  });
});
