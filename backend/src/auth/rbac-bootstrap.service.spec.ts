import { PrismaService } from '../database/prisma.service';
import {
  ADMIN_ROLE_DESCRIPTION,
  ADMIN_ROLE_NAME,
  DEFAULT_USER_ROLE_DESCRIPTION,
  DEFAULT_USER_ROLE_NAME,
} from './auth.constants';
import { RbacBootstrapService } from './rbac-bootstrap.service';

describe('RbacBootstrapService', () => {
  it('idempotently activates the default USER role', async () => {
    const prisma = {
      role: {
        upsert: jest.fn().mockResolvedValue({
          id: 'role-id',
          name: DEFAULT_USER_ROLE_NAME,
        }),
      },
    };
    const service = new RbacBootstrapService(
      prisma as unknown as PrismaService,
    );

    await service.ensureDefaultUserRole();

    expect(prisma.role.upsert).toHaveBeenCalledWith({
      where: {
        name: DEFAULT_USER_ROLE_NAME,
      },
      create: {
        name: DEFAULT_USER_ROLE_NAME,
        description: DEFAULT_USER_ROLE_DESCRIPTION,
        status: 'ACTIVE',
      },
      update: {
        description: DEFAULT_USER_ROLE_DESCRIPTION,
        status: 'ACTIVE',
      },
    });
  });

  it('idempotently activates the ADMIN role', async () => {
    const prisma = {
      role: {
        upsert: jest.fn().mockResolvedValue({
          id: 'admin-role-id',
          name: ADMIN_ROLE_NAME,
        }),
      },
    };
    const service = new RbacBootstrapService(
      prisma as unknown as PrismaService,
    );

    await service.ensureAdminRole();

    expect(prisma.role.upsert).toHaveBeenCalledWith({
      where: {
        name: ADMIN_ROLE_NAME,
      },
      create: {
        name: ADMIN_ROLE_NAME,
        description: ADMIN_ROLE_DESCRIPTION,
        status: 'ACTIVE',
      },
      update: {
        description: ADMIN_ROLE_DESCRIPTION,
      },
    });
  });
});
