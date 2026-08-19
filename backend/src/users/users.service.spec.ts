import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PasswordService } from '../auth/password.service';
import { RbacBootstrapService } from '../auth/rbac-bootstrap.service';
import { PrismaService } from '../database/prisma.service';
import { UsersService } from './users.service';

describe('UsersService security boundaries', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordService = {
    hash: jest.fn(),
  };

  const rbacBootstrapService = {
    ensureDefaultUserRole: jest.fn(),
  };

  const actor: AuthenticatedUser = {
    id: 'actor-id',
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

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new UsersService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
    );
  });

  it('refuses to change founder SUPER_ADMIN status', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'founder-id',
      status: 'ACTIVE',
      roles: [
        {
          role: {
            name: 'SUPER_ADMIN',
          },
        },
      ],
    });

    await expect(
      service.updateStatus(
        'founder-id',
        { status: 'BLOCKED' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to assign SUPER_ADMIN through user role management', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      roles: [
        {
          role: {
            name: 'USER',
          },
        },
      ],
    });

    await expect(
      service.replaceRoles(
        'user-id',
        {
          roleNames: ['SUPER_ADMIN'],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses self role mutation', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: actor.id,
      roles: [
        {
          role: {
            name: 'ADMIN',
          },
        },
      ],
    });

    await expect(
      service.replaceRoles(
        actor.id,
        {
          roleNames: ['ADMIN'],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
