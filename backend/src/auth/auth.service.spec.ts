import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

describe('AuthService', () => {
  const transaction = {
    user: {
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  const passwordService = {
    hash: jest.fn(),
    verifyForAuthentication: jest.fn(),
  };

  const rbacBootstrapService = {
    ensureDefaultUserRole: jest.fn(),
  };

  const jwtService = {
    signAsync: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
      jwtService as unknown as JwtService,
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

  it('logs in an active user and records the successful login transactionally', async () => {
    const dto: LoginDto = {
      email: 'user@example.com',
      password: 'SecurePassword123!',
    };

    const createdAt = new Date('2026-08-18T00:00:00.000Z');

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: dto.email,
      passwordHash: 'argon2-hash',
      username: 'trader.one',
      phone: '+919876543210',
      firstName: 'Prashant',
      lastName: 'Shukla',
      status: 'ACTIVE',
      createdAt,
      roles: [
        { role: { name: 'USER', status: 'ACTIVE' } },
        { role: { name: 'OLD_ROLE', status: 'INACTIVE' } },
      ],
    });

    passwordService.verifyForAuthentication.mockResolvedValue(true);
    jwtService.signAsync.mockResolvedValue('signed-access-token');
    transaction.user.update.mockResolvedValue({ id: 'user-id' });
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    const result = await service.login(dto);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        email: dto.email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
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
                status: true,
              },
            },
          },
        },
      },
    });

    expect(passwordService.verifyForAuthentication).toHaveBeenCalledWith(
      'argon2-hash',
      dto.password,
    );

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      email: dto.email,
      type: 'access',
    });

    expect(transaction.user.update).toHaveBeenCalledWith({
      where: {
        id: 'user-id',
      },
      data: {
        lastLoginAt: result.user.lastLoginAt,
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: 'user-id',
        action: 'LOGIN',
        entityType: 'User',
        entityId: 'user-id',
        description: 'User authenticated with a password.',
        metadata: {
          source: 'PASSWORD_LOGIN',
          tokenType: 'ACCESS',
        },
      },
    });

    expect(result).toEqual({
      message: 'Login successful.',
      tokenType: 'Bearer',
      accessToken: 'signed-access-token',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: 'user-id',
        email: dto.email,
        username: 'trader.one',
        phone: '+919876543210',
        firstName: 'Prashant',
        lastName: 'Shukla',
        status: 'ACTIVE',
        createdAt,
        lastLoginAt: result.user.lastLoginAt,
        roles: ['USER'],
      },
    });

    expect(result.user.lastLoginAt).toBeInstanceOf(Date);
    expect(JSON.stringify(result)).not.toContain('argon2-hash');
    expect(JSON.stringify(result)).not.toContain(dto.password);
  });

  it('uses the same credential path for an unknown email', async () => {
    const dto: LoginDto = {
      email: 'missing@example.com',
      password: 'SecurePassword123!',
    };

    prisma.user.findUnique.mockResolvedValue(null);
    passwordService.verifyForAuthentication.mockResolvedValue(false);

    await expect(service.login(dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(passwordService.verifyForAuthentication).toHaveBeenCalledWith(
      null,
      dto.password,
    );

    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the same credential error for an incorrect password', async () => {
    const dto: LoginDto = {
      email: 'user@example.com',
      password: 'WrongPassword123!',
    };

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      passwordHash: 'argon2-hash',
    });
    passwordService.verifyForAuthentication.mockResolvedValue(false);

    await expect(service.login(dto)).rejects.toMatchObject({
      message: 'Invalid email or password.',
    });

    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'SUSPENDED', 'BLOCKED'])(
    'blocks valid credentials when the account is %s',
    async (status) => {
      const dto: LoginDto = {
        email: 'user@example.com',
        password: 'SecurePassword123!',
      };

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-id',
        passwordHash: 'argon2-hash',
        status,
      });
      passwordService.verifyForAuthentication.mockResolvedValue(true);

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
