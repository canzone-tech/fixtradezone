import { PrismaService } from '../database/prisma.service';
import {
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
});
