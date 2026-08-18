import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_USER_ROLE_DESCRIPTION,
  DEFAULT_USER_ROLE_NAME,
} from './auth.constants';

type RoleWriter = Pick<PrismaService, 'role'>;

@Injectable()
export class RbacBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDefaultUserRole();
  }

  ensureDefaultUserRole(client: RoleWriter = this.prisma) {
    return client.role.upsert({
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
  }
}
