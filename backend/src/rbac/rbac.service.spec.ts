import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { RbacService } from './rbac.service';

describe('RbacService permission security', () => {
  const prisma = {
    role: {
      findUnique: jest.fn(),
    },
    permission: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const superAdmin: AuthenticatedUser = {
    id: 'super-admin-id',
    email: 'superadmin@fixtradezone.com',
    username: 'superadmin',
    phone: null,
    firstName: 'FixTradeZone',
    lastName: 'Founder',
    status: 'ACTIVE',
    createdAt: new Date(),
    lastLoginAt: null,
    roles: ['SUPER_ADMIN', 'USER'],
    permissions: [],
  };

  const admin: AuthenticatedUser = {
    ...superAdmin,
    id: 'admin-id',
    email: 'admin@fixtradezone.com',
    username: 'admin',
    roles: ['ADMIN', 'USER'],
    permissions: ['rbac.manage'],
  };

  let service: RbacService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new RbacService(prisma as unknown as PrismaService);
  });

  it('refuses SUPER_ADMIN permission mutation', async () => {
    prisma.role.findUnique.mockResolvedValue({
      id: 'super-role-id',
      name: 'SUPER_ADMIN',
      status: 'ACTIVE',
      permissions: [],
    });

    await expect(
      service.replaceRolePermissions(
        'SUPER_ADMIN',
        { permissionCodes: ['users.read'] },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses base USER permission mutation', async () => {
    prisma.role.findUnique.mockResolvedValue({
      id: 'user-role-id',
      name: 'USER',
      status: 'ACTIVE',
      permissions: [],
    });

    await expect(
      service.replaceRolePermissions(
        'USER',
        { permissionCodes: ['users.read'] },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows only SUPER_ADMIN to change ADMIN scope', async () => {
    prisma.role.findUnique.mockResolvedValue({
      id: 'admin-role-id',
      name: 'ADMIN',
      status: 'ACTIVE',
      permissions: [],
    });

    await expect(
      service.replaceRolePermissions(
        'ADMIN',
        { permissionCodes: ['users.read'] },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown permission codes', async () => {
    prisma.role.findUnique.mockResolvedValue({
      id: 'admin-role-id',
      name: 'ADMIN',
      status: 'ACTIVE',
      permissions: [],
    });

    prisma.permission.findMany.mockResolvedValue([]);

    await expect(
      service.replaceRolePermissions(
        'ADMIN',
        { permissionCodes: ['unknown.permission'] },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
