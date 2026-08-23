import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

@Injectable()
export class FounderSuperAdminBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacBootstrapService: RbacBootstrapService,
  ) {}

  bootstrap(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    return this.prisma.$transaction(
      async (transaction) => {
        const superAdminRole =
          await this.rbacBootstrapService.ensureSuperAdminRole(transaction);

        const existingFounder = await transaction.userRole.findFirst({
          where: {
            roleId: superAdminRole.id,
          },
          select: {
            userId: true,
          },
        });

        if (existingFounder) {
          throw new ConflictException('A founder SUPER_ADMIN already exists.');
        }

        const users = await transaction.user.findMany({
          where: {
            email: normalizedEmail,
          },
          take: 2,
          select: {
            id: true,
            email: true,
            status: true,
          },
        });

        if (users.length === 0) {
          throw new NotFoundException(
            'The requested founder bootstrap user was not found.',
          );
        }

        if (users.length > 1) {
          throw new ConflictException(
            'Founder bootstrap email is shared by multiple accounts and is ambiguous.',
          );
        }

        const user = users[0];

        await transaction.userRole.create({
          data: {
            userId: user.id,
            roleId: superAdminRole.id,
          },
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
            description: 'Initial founder SUPER_ADMIN role assigned.',
            metadata: {
              source: 'FOUNDER_SUPER_ADMIN_BOOTSTRAP_CLI',
              role: superAdminRole.name,
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
              description: 'Initial founder account activated.',
              metadata: {
                source: 'FOUNDER_SUPER_ADMIN_BOOTSTRAP_CLI',
                previousStatus: user.status,
              },
            },
          });
        }

        return {
          id: user.id,
          email: user.email,
          status: 'ACTIVE' as const,
          assignedRole: superAdminRole.name,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }
}
