import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

@Injectable()
export class FounderAdminBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacBootstrapService: RbacBootstrapService,
  ) {}

  bootstrap(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    return this.prisma.$transaction(
      async (transaction) => {
        const adminRole =
          await this.rbacBootstrapService.ensureAdminRole(transaction);
        const existingAdmin = await transaction.userRole.findFirst({
          where: {
            roleId: adminRole.id,
          },
          select: {
            userId: true,
          },
        });

        if (existingAdmin) {
          throw new ConflictException(
            'An administrator already exists; use the audited RBAC workflow for further assignments.',
          );
        }

        const user = await transaction.user.findUnique({
          where: {
            email: normalizedEmail,
          },
          select: {
            id: true,
            email: true,
            status: true,
          },
        });

        if (!user) {
          throw new NotFoundException(
            'The requested bootstrap user was not found.',
          );
        }

        await transaction.userRole.upsert({
          where: {
            userId_roleId: {
              userId: user.id,
              roleId: adminRole.id,
            },
          },
          create: {
            userId: user.id,
            roleId: adminRole.id,
          },
          update: {},
        });
        await transaction.user.update({
          where: {
            id: user.id,
          },
          data: {
            status: 'ACTIVE',
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: null,
            action: 'ROLE_CHANGE',
            entityType: 'User',
            entityId: user.id,
            description: 'Initial founder administrator role assigned.',
            metadata: {
              source: 'FOUNDER_ADMIN_BOOTSTRAP_CLI',
              role: adminRole.name,
            },
          },
        });

        if (user.status !== 'ACTIVE') {
          await transaction.auditLog.create({
            data: {
              actorUserId: null,
              action: 'ACTIVATE',
              entityType: 'User',
              entityId: user.id,
              description: 'Initial founder administrator account activated.',
              metadata: {
                source: 'FOUNDER_ADMIN_BOOTSTRAP_CLI',
                previousStatus: user.status,
              },
            },
          });
        }

        return {
          id: user.id,
          email: user.email,
          status: 'ACTIVE' as const,
          roles: [adminRole.name],
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }
}
