import { PrismaService } from '../database/prisma.service';
import {
  ADMIN_ROLE_DESCRIPTION,
  ADMIN_ROLE_NAME,
  DEFAULT_USER_ROLE_DESCRIPTION,
  DEFAULT_USER_ROLE_NAME,
  SUPER_ADMIN_ROLE_DESCRIPTION,
  SUPER_ADMIN_ROLE_NAME,
} from './auth.constants';
import { RbacBootstrapService } from './rbac-bootstrap.service';

describe('RbacBootstrapService', () => {
  function createService() {
    const prisma = {
      role: {
        upsert: jest.fn(),
      },
    };

    return {
      prisma,
      service: new RbacBootstrapService(prisma as unknown as PrismaService),
    };
  }

  it('idempotently activates the default USER role', async () => {
    const { prisma, service } = createService();

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
    const { prisma, service } = createService();

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
        status: 'ACTIVE',
      },
    });
  });

  it('idempotently activates the SUPER_ADMIN role', async () => {
    const { prisma, service } = createService();

    await service.ensureSuperAdminRole();

    expect(prisma.role.upsert).toHaveBeenCalledWith({
      where: {
        name: SUPER_ADMIN_ROLE_NAME,
      },
      create: {
        name: SUPER_ADMIN_ROLE_NAME,
        description: SUPER_ADMIN_ROLE_DESCRIPTION,
        status: 'ACTIVE',
      },
      update: {
        description: SUPER_ADMIN_ROLE_DESCRIPTION,
        status: 'ACTIVE',
      },
    });
  });
});
