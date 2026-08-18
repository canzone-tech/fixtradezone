import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === code;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly rbacBootstrapService: RbacBootstrapService,
  ) {}

  async register(dto: RegisterDto) {
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
          select: {
            id: true,
            email: true,
            username: true,
            phone: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
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

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            description: 'User completed self-registration.',
            metadata: {
              source: 'SELF_REGISTRATION',
            },
          },
        });

        return {
          message: 'Registration successful.',
          user: {
            ...user,
            roles: user.roles.map((userRole) => userRole.role.name),
          },
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
}
