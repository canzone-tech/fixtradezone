import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ADMIN_ROLE_NAME,
  DEFAULT_USER_ROLE_NAME,
  GENERIC_SESSION_ERROR,
  SUPER_ADMIN_ROLE_NAME,
} from '../auth/auth.constants';
import {
  AUTH_USER_SELECT,
  getAuthSessionId,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { RbacBootstrapService } from '../auth/rbac-bootstrap.service';
import { PrismaService } from '../database/prisma.service';
import {
  AdminCreateUserDto,
  ListUsersQueryDto,
  ReplaceUserRolesDto,
  UpdateUserStatusDto,
} from './dto';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly rbacBootstrapService: RbacBootstrapService,
    private readonly tokenService: TokenService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const where = {
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                email: {
                  contains: query.search,
                },
              },
              {
                username: {
                  contains: query.search,
                },
              },
              {
                phone: {
                  contains: query.search,
                },
              },
              {
                firstName: {
                  contains: query.search,
                },
              },
              {
                lastName: {
                  contains: query.search,
                },
              },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({
        where,
      }),
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        select: AUTH_USER_SELECT,
      }),
    ]);

    return {
      users: users.map(toAuthenticatedUser),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async create(
    dto: AdminCreateUserDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const defaultRole =
          await this.rbacBootstrapService.ensureDefaultUserRole(transaction);

        const user = await transaction.user.create({
          data: {
            email: dto.email,
            passwordHash,
            username: dto.username,
            phone: dto.phone,
            firstName: dto.firstName,
            lastName: dto.lastName,
            status: 'PENDING',
            roles: {
              create: {
                role: {
                  connect: {
                    id: defaultRole.id,
                  },
                },
              },
            },
          },
          select: AUTH_USER_SELECT,
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            description: 'Administrator created a platform user.',
            metadata: {
              source: 'ADMIN_API',
              createdEmail: user.email,
              actorRoles: actor.roles,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'User created successfully.',
          user: toAuthenticatedUser(user),
        };
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException(
          'An account already exists with one of the supplied identifiers.',
        );
      }

      throw error;
    }
  }

  async updateStatus(
    userId: string,
    dto: UpdateUserStatusDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const target = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const targetRoles = target.roles.map((entry) => entry.role.name);

    if (targetRoles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'The founder SUPER_ADMIN account cannot be modified through this operation.',
      );
    }

    if (actor.id === target.id) {
      throw new ForbiddenException(
        'You cannot change your own account status.',
      );
    }

    if (target.status === dto.status) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: AUTH_USER_SELECT,
      });

      return {
        message: 'User status is already up to date.',
        user: toAuthenticatedUser(user),
      };
    }

    const changedAt = new Date();

    const action =
      dto.status === 'BLOCKED'
        ? 'BLOCK'
        : dto.status === 'SUSPENDED'
          ? 'SUSPEND'
          : target.status === 'BLOCKED'
            ? 'UNBLOCK'
            : 'ACTIVATE';

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: {
          id: userId,
        },
        data: {
          status: dto.status,
        },
        select: AUTH_USER_SELECT,
      });

      if (dto.status !== 'ACTIVE') {
        await transaction.authSession.updateMany({
          where: {
            userId,
            revokedAt: null,
          },
          data: {
            revokedAt: changedAt,
            revocationReason: `ACCOUNT_STATUS_${dto.status}`,
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action,
          entityType: 'User',
          entityId: userId,
          description: 'Administrator changed user status.',
          metadata: {
            source: 'ADMIN_API',
            previousStatus: target.status,
            newStatus: dto.status,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        message: 'User status updated successfully.',
        user: toAuthenticatedUser(user),
      };
    });
  }

  async replaceRoles(
    userId: string,
    dto: ReplaceUserRolesDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const target = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const previousRoleNames = target.roles
      .map((entry) => entry.role.name)
      .sort();

    if (previousRoleNames.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'The founder SUPER_ADMIN roles cannot be modified through this operation.',
      );
    }

    if (actor.id === target.id) {
      throw new ForbiddenException('You cannot change your own roles.');
    }

    if (dto.roleNames.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'SUPER_ADMIN is reserved for the founder bootstrap workflow.',
      );
    }

    const requestedRoleNames = dto.roleNames.filter(
      (name) => name !== DEFAULT_USER_ROLE_NAME,
    );

    return this.prisma.$transaction(
      async (transaction) => {
        const defaultRole =
          await this.rbacBootstrapService.ensureDefaultUserRole(transaction);

        const requestedRoles =
          requestedRoleNames.length === 0
            ? []
            : await transaction.role.findMany({
                where: {
                  name: {
                    in: requestedRoleNames,
                  },
                  status: 'ACTIVE',
                },
                select: {
                  id: true,
                  name: true,
                },
              });

        const foundRoleNames = new Set(requestedRoles.map((role) => role.name));

        const missingRoleNames = requestedRoleNames.filter(
          (name) => !foundRoleNames.has(name),
        );

        if (missingRoleNames.length > 0) {
          throw new BadRequestException(
            `Unknown or inactive roles: ${missingRoleNames.join(', ')}.`,
          );
        }

        const desiredRoleIds = [
          defaultRole.id,
          ...requestedRoles.map((role) => role.id),
        ];

        await transaction.userRole.deleteMany({
          where: {
            userId,
            roleId: {
              notIn: desiredRoleIds,
            },
          },
        });

        await transaction.userRole.createMany({
          data: desiredRoleIds.map((roleId) => ({
            userId,
            roleId,
          })),
          skipDuplicates: true,
        });

        const user = await transaction.user.findUniqueOrThrow({
          where: {
            id: userId,
          },
          select: AUTH_USER_SELECT,
        });

        const newRoleNames = [
          DEFAULT_USER_ROLE_NAME,
          ...requestedRoles.map((role) => role.name),
        ].sort();

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'ROLE_CHANGE',
            entityType: 'User',
            entityId: userId,
            description: 'Administrator replaced user role assignments.',
            metadata: {
              source: 'ADMIN_API',
              previousRoles: previousRoleNames,
              newRoles: newRoleNames,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'User roles updated successfully.',
          user: toAuthenticatedUser(user),
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async startImpersonation(
    userId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const actorSessionId = getAuthSessionId(actor);

    if (!actorSessionId) {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    const target = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: AUTH_USER_SELECT,
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const subject = toAuthenticatedUser(target);

    if (actor.id === subject.id) {
      throw new ForbiddenException('You cannot impersonate your own account.');
    }

    if (subject.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Only ACTIVE user accounts can be impersonated.',
      );
    }

    if (
      !subject.roles.includes(DEFAULT_USER_ROLE_NAME) ||
      subject.roles.includes(ADMIN_ROLE_NAME) ||
      subject.roles.includes(SUPER_ADMIN_ROLE_NAME)
    ) {
      throw new ForbiddenException(
        'Administrator accounts cannot be impersonated.',
      );
    }

    const now = new Date();

    await this.prisma.impersonationSession.updateMany({
      where: {
        actorSessionId,
        endedAt: null,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        activeKey: null,
        endedAt: now,
        endReason: 'EXPIRED',
      },
    });

    const active = await this.prisma.impersonationSession.findFirst({
      where: {
        actorSessionId,
        activeKey: actorSessionId,
        endedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (active) {
      throw new ConflictException(
        'An impersonation session is already active. Return to the administrator account first.',
      );
    }

    const impersonationId = randomUUID();

    const issued = await this.tokenService.issueImpersonationToken(
      {
        id: subject.id,
        email: subject.email,
      },
      actor.id,
      actorSessionId,
      impersonationId,
    );

    try {
      const session = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.impersonationSession.create({
            data: {
              id: impersonationId,
              actorUserId: actor.id,
              subjectUserId: subject.id,
              actorSessionId,
              activeKey: actorSessionId,
              expiresAt: issued.expiresAt,
            },
            select: {
              id: true,
              createdAt: true,
              expiresAt: true,
            },
          });

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'IMPERSONATION_START',
              entityType: 'User',
              entityId: subject.id,
              description:
                'Administrator started a user impersonation session.',
              metadata: {
                source: 'ADMIN_API',
                impersonationSessionId: created.id,
                subjectEmail: subject.email,
                actorRoles: actor.roles,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return created;
        },
        {
          isolationLevel: 'Serializable',
        },
      );

      return {
        message: 'User impersonation session started.',
        tokenType: 'Bearer' as const,
        impersonationToken: issued.impersonationToken,
        expiresIn: issued.expiresIn,
        impersonation: {
          id: session.id,
          startedAt: session.createdAt,
          expiresAt: session.expiresAt,
          actor: {
            id: actor.id,
            email: actor.email,
          },
          subject,
        },
      };
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException(
          'An impersonation session is already active. Return to the administrator account first.',
        );
      }

      throw error;
    }
  }

  async stopImpersonation(
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const actorSessionId = getAuthSessionId(actor);

    if (!actorSessionId) {
      throw new UnauthorizedException(GENERIC_SESSION_ERROR);
    }

    const active = await this.prisma.impersonationSession.findFirst({
      where: {
        actorUserId: actor.id,
        actorSessionId,
        activeKey: actorSessionId,
        endedAt: null,
      },
      select: {
        id: true,
        subjectUserId: true,
        subject: {
          select: {
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!active) {
      return {
        message: 'No active impersonation session.',
      };
    }

    const endedAt = new Date();

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.impersonationSession.update({
          where: {
            id: active.id,
          },
          data: {
            activeKey: null,
            endedAt,
            endReason: 'ACTOR_RETURN',
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'IMPERSONATION_STOP',
            entityType: 'User',
            entityId: active.subjectUserId,
            description: 'Administrator ended a user impersonation session.',
            metadata: {
              source: 'ADMIN_API',
              impersonationSessionId: active.id,
              subjectEmail: active.subject.email,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    return {
      message: 'Returned to administrator account.',
      impersonationId: active.id,
      endedAt,
    };
  }
}
