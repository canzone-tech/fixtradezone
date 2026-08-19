import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        permissions: {
          select: {
            permission: {
              select: {
                id: true,
                code: true,
                description: true,
              },
            },
          },
        },
      },
    });

    return roles.map((role) => ({
      ...role,
      permissions: role.permissions
        .map((entry) => entry.permission)
        .sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: {
        code: 'asc',
      },
      select: {
        id: true,
        code: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
