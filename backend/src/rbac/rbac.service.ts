import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_USER_ROLE_NAME,
  SUPER_ADMIN_ROLE_NAME,
  ADMIN_ROLE_NAME,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { ReplaceRolePermissionsDto } from './dto/replace-role-permissions.dto';

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

  async replaceRolePermissions(
    rawRoleName: string,
    dto: ReplaceRolePermissionsDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const roleName = rawRoleName.trim().toUpperCase();

    const role = await this.prisma.role.findUnique({
      where: {
        name: roleName,
      },
      select: {
        id: true,
        name: true,
        status: true,
        permissions: {
          select: {
            permission: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    if (role.name === SUPER_ADMIN_ROLE_NAME) {
      throw new ForbiddenException(
        'SUPER_ADMIN permissions are implicit and cannot be modified.',
      );
    }

    if (role.name === DEFAULT_USER_ROLE_NAME) {
      throw new ForbiddenException(
        'The base USER role permissions cannot be modified through this operation.',
      );
    }

    if (role.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Permissions cannot be assigned to an inactive role.',
      );
    }

    if (
      role.name === ADMIN_ROLE_NAME &&
      !actor.roles.includes(SUPER_ADMIN_ROLE_NAME)
    ) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify the ADMIN permission scope.',
      );
    }

    const requestedCodes = [...dto.permissionCodes].sort();

    const permissions =
      requestedCodes.length === 0
        ? []
        : await this.prisma.permission.findMany({
            where: {
              code: {
                in: requestedCodes,
              },
            },
            select: {
              id: true,
              code: true,
              description: true,
            },
          });

    const foundCodes = new Set(
      permissions.map((permission) => permission.code),
    );

    const missingCodes = requestedCodes.filter((code) => !foundCodes.has(code));

    if (missingCodes.length > 0) {
      throw new BadRequestException(
        `Unknown permissions: ${missingCodes.join(', ')}.`,
      );
    }

    const previousPermissions = role.permissions
      .map((entry) => entry.permission.code)
      .sort();

    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.rolePermission.deleteMany({
          where: {
            roleId: role.id,
          },
        });

        if (permissions.length > 0) {
          await transaction.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
            skipDuplicates: true,
          });
        }

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'PERMISSION_CHANGE',
            entityType: 'Role',
            entityId: role.id,
            description: 'Administrator replaced role permission assignments.',
            metadata: {
              source: 'ADMIN_API',
              roleName: role.name,
              previousPermissions,
              newPermissions: requestedCodes,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        const updatedRole = await transaction.role.findUniqueOrThrow({
          where: {
            id: role.id,
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

        return {
          message: 'Role permissions updated successfully.',
          role: {
            ...updatedRole,
            permissions: updatedRole.permissions
              .map((entry) => entry.permission)
              .sort((a, b) => a.code.localeCompare(b.code)),
          },
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }
}
