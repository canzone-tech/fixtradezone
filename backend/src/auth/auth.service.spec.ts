import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

describe('AuthService', () => {
  const transaction = {
    user: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const passwordService = {
    hash: jest.fn(),
  };
  const rbacBootstrapService = {
    ensureDefaultUserRole: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
    );
  });

  it('registers a user transactionally with the default role and audit log', async () => {
    const dto: RegisterDto = {
      email: 'user@example.com',
      password: 'SecurePassword123!',
      username: 'trader.one',
      phone: '+919876543210',
      firstName: 'Prashant',
      lastName: 'Shukla',
    };

    passwordService.hash.mockResolvedValue('argon2-hash');
    rbacBootstrapService.ensureDefaultUserRole.mockResolvedValue({
      id: 'role-id',
      name: 'USER',
    });
    transaction.user.create.mockResolvedValue({
      id: 'user-id',
      email: dto.email,
      username: dto.username,
      phone: dto.phone,
      firstName: dto.firstName,
      lastName: dto.lastName,
      status: 'PENDING',
      createdAt: new Date('2026-08-18T00:00:00.000Z'),
      roles: [{ role: { name: 'USER' } }],
    });
    transaction.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    const result = await service.register(dto);

    expect(passwordService.hash).toHaveBeenCalledWith(dto.password);
    expect(rbacBootstrapService.ensureDefaultUserRole).toHaveBeenCalledWith(
      transaction,
    );
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: dto.email,
        passwordHash: 'argon2-hash',
        username: dto.username,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        roles: {
          create: {
            role: {
              connect: {
                id: 'role-id',
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
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-id',
        action: 'CREATE',
        entityType: 'User',
        entityId: 'user-id',
        description: 'User completed self-registration.',
        metadata: {
          source: 'SELF_REGISTRATION',
        },
      },
    });
    expect(result).toEqual({
      message: 'Registration successful.',
      user: {
        id: 'user-id',
        email: dto.email,
        username: dto.username,
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: 'PENDING',
        createdAt: new Date('2026-08-18T00:00:00.000Z'),
        roles: ['USER'],
      },
    });
    expect(JSON.stringify(result)).not.toContain('argon2-hash');
    expect(JSON.stringify(result)).not.toContain(dto.password);
  });

  it('returns a conflict for duplicate user identifiers', async () => {
    const dto: RegisterDto = {
      email: 'user@example.com',
      password: 'SecurePassword123!',
    };

    passwordService.hash.mockResolvedValue('argon2-hash');
    rbacBootstrapService.ensureDefaultUserRole.mockResolvedValue({
      id: 'role-id',
      name: 'USER',
    });
    transaction.user.create.mockRejectedValue({
      code: 'P2002',
    });

    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
