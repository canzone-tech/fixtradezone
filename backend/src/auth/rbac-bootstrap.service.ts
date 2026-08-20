import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  SYSTEM_PERMISSIONS,
} from '../rbac/rbac.constants';
import {
  ADMIN_ROLE_DESCRIPTION,
  ADMIN_ROLE_NAME,
  DEFAULT_USER_ROLE_DESCRIPTION,
  DEFAULT_USER_ROLE_NAME,
  SUPER_ADMIN_ROLE_DESCRIPTION,
  SUPER_ADMIN_ROLE_NAME,
} from './auth.constants';

type RbacWriter = Pick<PrismaService, 'role' | 'permission'>;

@Injectable()
export class RbacBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await Promise.all([
      this.ensureDefaultUserRole(),
      this.ensureAdminRole(),
      this.ensureSuperAdminRole(),
      ...SYSTEM_PERMISSIONS.map((permission) =>
        this.ensurePermission(
          permission.code,
          permission.description,
        ),
      ),
    ]);
  }

  ensureDefaultUserRole(client: RbacWriter = this.prisma) {
    return client.role.upsert({
      where: { name: DEFAULT_USER_ROLE_NAME },
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
  }

  ensureAdminRole(client: RbacWriter = this.prisma) {
    return client.role.upsert({
      where: { name: ADMIN_ROLE_NAME },
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
  }

  ensureSuperAdminRole(client: RbacWriter = this.prisma) {
    return client.role.upsert({
      where: { name: SUPER_ADMIN_ROLE_NAME },
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
  }

  ensurePermission(
    code: string,
    description: string,
    client: RbacWriter = this.prisma,
  ) {
    return client.permission.upsert({
      where: { code },
      create: {
        code,
        description,
      },
      update: {
        description,
      },
    });
  }
}
