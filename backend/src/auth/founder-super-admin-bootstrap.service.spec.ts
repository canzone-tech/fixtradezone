import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FounderSuperAdminBootstrapService } from './founder-super-admin-bootstrap.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

describe('FounderSuperAdminBootstrapService', () => {
  const transaction = {
    userRole: {
      findFirst: jest.fn(),
      create: jest.fn(),
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
    ensureSuperAdminRole: jest.fn(),
  };

  let service: FounderSuperAdminBootstrapService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new FounderSuperAdminBootstrapService(
      prisma as unknown as PrismaService,
      rbacBootstrapService as unknown as RbacBootstrapService,
    );
  });

  it('assigns and audits the only founder SUPER_ADMIN role', async () => {
    rbacBootstrapService.ensureSuperAdminRole.mockResolvedValue({
      id: 'super-admin-role-id',
      name: 'SUPER_ADMIN',
    });

    transaction.userRole.findFirst.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue({
      id: 'founder-user-id',
      email: 'founder@example.com',
      status: 'PENDING',
    });

    const result = await service.bootstrap(' Founder@Example.COM ');

    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      where: {
        email: 'founder@example.com',
      },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    expect(transaction.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'founder-user-id',
        roleId: 'super-admin-role-id',
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);

    expect(result).toEqual({
      id: 'founder-user-id',
      email: 'founder@example.com',
      status: 'ACTIVE',
      assignedRole: 'SUPER_ADMIN',
    });
  });

  it('refuses to create a second founder SUPER_ADMIN', async () => {
    rbacBootstrapService.ensureSuperAdminRole.mockResolvedValue({
      id: 'super-admin-role-id',
      name: 'SUPER_ADMIN',
    });

    transaction.userRole.findFirst.mockResolvedValue({
      userId: 'existing-founder-id',
    });

    await expect(
      service.bootstrap('founder@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects bootstrap when the requested user does not exist', async () => {
    rbacBootstrapService.ensureSuperAdminRole.mockResolvedValue({
      id: 'super-admin-role-id',
      name: 'SUPER_ADMIN',
    });

    transaction.userRole.findFirst.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue(null);

    await expect(
      service.bootstrap('missing@example.com'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(transaction.userRole.create).not.toHaveBeenCalled();
  });
});
