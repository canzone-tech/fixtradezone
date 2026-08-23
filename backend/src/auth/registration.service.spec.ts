import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { AUTH_USER_SELECT, type AuthenticatedUser } from './auth-user';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { RegistrationService } from './registration.service';

describe('RegistrationService', () => {
  const createdUser = {
    id: 'new-user-id',
    email: 'user@example.com',
    username: 'trader.one',
    phone: '+919876543210',
    firstName: 'Prashant',
    lastName: 'Shukla',
    status: 'PENDING' as const,
    createdAt: new Date('2026-08-22T00:00:00.000Z'),
    lastLoginAt: null,
    roles: [
      {
        role: {
          name: 'USER',
          status: 'ACTIVE' as const,
          permissions: [],
        },
      },
    ],
  };

  const transaction = {
    systemRegistrationConfig: {
      findUnique: jest.fn(),
    },
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    userIdentifierClaim: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    systemSequence: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  const passwordService = {
    hash: jest.fn(),
    generateTemporaryPassword: jest.fn(),
  };

  const rbacBootstrapService = {
    ensureDefaultUserRole: jest.fn(),
  };

  const defaultRole = {
    id: 'user-role-id',
    name: 'USER',
  };

  const manualDto = {
    email: 'user@example.com',
    username: 'Trader.One',
    phone: '+919876543210',
    password: 'SecurePassword123!',
    firstName: 'Prashant',
    lastName: 'Shukla',
  };

  const superAdminActor: AuthenticatedUser = {
    id: 'super-admin-id',
    email: 'founder@example.com',
    username: 'founder',
    phone: null,
    firstName: 'Founder',
    lastName: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    lastLoginAt: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
  };

  const adminActor: AuthenticatedUser = {
    ...superAdminActor,
    id: 'admin-id',
    username: 'admin',
    roles: ['ADMIN'],
  };

  const authorizedUserActor: AuthenticatedUser = {
    ...superAdminActor,
    id: 'registrar-id',
    username: 'registrar',
    roles: ['USER'],
    permissions: [PERMISSIONS.USERS_CREATE],
  };

  let service: RegistrationService;

  beforeEach(() => {
    jest.clearAllMocks();

    transaction.systemRegistrationConfig.findUnique.mockResolvedValue(null);
    transaction.user.create.mockResolvedValue(createdUser);
    transaction.user.findUnique.mockResolvedValue(null);

    transaction.userIdentifierClaim.create.mockResolvedValue({
      id: 'claim-id',
    });

    transaction.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    transaction.systemSequence.upsert.mockResolvedValue({
      key: 'username',
      nextValue: 100001n,
    });

    transaction.systemSequence.update.mockResolvedValue({
      key: 'username',
      nextValue: 100002n,
    });

    transaction.$queryRaw.mockResolvedValue([
      {
        nextValue: 100001n,
      },
    ]);

    passwordService.hash.mockResolvedValue('argon2-hash');

    passwordService.generateTemporaryPassword.mockReturnValue(
      'generated-temporary-password',
    );

    rbacBootstrapService.ensureDefaultUserRole.mockResolvedValue(defaultRole);

    service = new RegistrationService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
    );
  });

  it('registers a public user with manual credentials, identifier claims and audit', async () => {
    const result = await service.registerPublic(manualDto, {
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    });

    expect(passwordService.hash).toHaveBeenCalledWith(manualDto.password);

    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: manualDto.email,
        username: 'trader.one',
        phone: manualDto.phone,
        passwordHash: 'argon2-hash',
        mustChangePassword: false,
        firstName: manualDto.firstName,
        lastName: manualDto.lastName,
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

    expect(transaction.userIdentifierClaim.create).toHaveBeenCalledWith({
      data: {
        userId: createdUser.id,
        type: 'EMAIL',
        normalizedValue: 'user@example.com',
      },
    });

    expect(transaction.userIdentifierClaim.create).toHaveBeenCalledWith({
      data: {
        userId: createdUser.id,
        type: 'MOBILE',
        normalizedValue: '+919876543210',
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: createdUser.id,
        action: 'CREATE',
        entityType: 'User',
        entityId: createdUser.id,
        description: 'User completed self-registration.',
        metadata: {
          source: 'SELF_REGISTRATION',
          createdByUserId: null,
          generatedUsername: false,
          generatedPassword: false,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });

    expect(result).toMatchObject({
      message: 'Registration successful.',
      user: {
        id: createdUser.id,
        username: createdUser.username,
        roles: ['USER'],
      },
    });

    expect(result).not.toHaveProperty('temporaryPassword');

    expect(JSON.stringify(result)).not.toContain('argon2-hash');

    expect(JSON.stringify(result)).not.toContain(manualDto.password);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects public registration when disabled', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      publicRegistrationEnabled: false,
    });

    await expect(service.registerPublic(manualDto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(passwordService.hash).not.toHaveBeenCalled();
    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('records SUPER_ADMIN as the dashboard registration source', async () => {
    await service.registerDashboard(manualDto, superAdminActor, {
      ipAddress: '127.0.0.1',
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: superAdminActor.id,
        action: 'CREATE',
        entityType: 'User',
        entityId: createdUser.id,
        description: 'Authorized account creator registered a platform user.',
        metadata: {
          source: 'SUPER_ADMIN',
          createdByUserId: superAdminActor.id,
          generatedUsername: false,
          generatedPassword: false,
        },
        ipAddress: '127.0.0.1',
        userAgent: undefined,
      },
    });
  });

  it('rejects ADMIN registration when the policy disables it', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      adminRegistrationEnabled: false,
    });

    await expect(
      service.registerDashboard(manualDto, adminActor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('allows an authorized USER only when registration and users.create are enabled', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      authorizedUserRegistrationEnabled: true,
    });

    await service.registerDashboard(manualDto, authorizedUserActor);

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: authorizedUserActor.id,
        action: 'CREATE',
        entityType: 'User',
        entityId: createdUser.id,
        description: 'Authorized account creator registered a platform user.',
        metadata: {
          source: 'AUTHORIZED_USER',
          createdByUserId: authorizedUserActor.id,
          generatedUsername: false,
          generatedPassword: false,
        },
        ipAddress: undefined,
        userAgent: undefined,
      },
    });

    const unauthorizedActor: AuthenticatedUser = {
      ...authorizedUserActor,
      id: 'unauthorized-id',
      username: 'unauthorized',
      permissions: [],
    };

    await expect(
      service.registerDashboard(manualDto, unauthorizedActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces required email and mobile registration policy', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      emailRequired: true,
      mobileRequired: true,
    });

    await expect(
      service.registerPublic({
        username: 'trader.one',
        password: 'SecurePassword123!',
        phone: '+919876543210',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.registerPublic({
        email: 'user@example.com',
        username: 'trader.one',
        password: 'SecurePassword123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generates an AUTO password, hashes it and marks the account for password change', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      passwordMode: 'AUTO',
    });

    const result = await service.registerPublic({
      email: manualDto.email,
      username: manualDto.username,
      phone: manualDto.phone,
    });

    expect(passwordService.generateTemporaryPassword).toHaveBeenCalledTimes(1);

    expect(passwordService.hash).toHaveBeenCalledWith(
      'generated-temporary-password',
    );

    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: manualDto.email,
        username: 'trader.one',
        phone: manualDto.phone,
        passwordHash: 'argon2-hash',
        mustChangePassword: true,
        firstName: undefined,
        lastName: undefined,
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

    expect(result).toMatchObject({
      temporaryPassword: 'generated-temporary-password',
      mustChangePassword: true,
    });
  });

  it('rejects manually supplied password when AUTO password mode is active', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      passwordMode: 'AUTO',
    });

    await expect(service.registerPublic(manualDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(passwordService.hash).not.toHaveBeenCalled();
  });

  it('generates a prefixed username from the locked sequence', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      usernameMode: 'AUTO',
      usernamePrefixEnabled: true,
      usernamePrefix: 'FTZ',
    });

    transaction.user.create.mockResolvedValue({
      ...createdUser,
      username: 'ftz100001',
    });

    const result = await service.registerPublic({
      email: manualDto.email,
      phone: manualDto.phone,
      password: manualDto.password,
    });

    expect(transaction.systemSequence.upsert).toHaveBeenCalledWith({
      where: {
        key: 'username',
      },
      create: {
        key: 'username',
        nextValue: 100001n,
      },
      update: {},
    });

    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      where: {
        username: 'ftz100001',
      },
      select: {
        id: true,
      },
    });

    expect(transaction.systemSequence.update).toHaveBeenCalledWith({
      where: {
        key: 'username',
      },
      data: {
        nextValue: 100002n,
      },
    });

    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: manualDto.email,
        username: 'ftz100001',
        phone: manualDto.phone,
        passwordHash: 'argon2-hash',
        mustChangePassword: false,
        firstName: undefined,
        lastName: undefined,
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

    expect(result.user.username).toBe('ftz100001');
  });

  it('skips email and mobile claims when multiple accounts are allowed', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      allowMultipleAccountsPerEmail: true,
      allowMultipleAccountsPerMobile: true,
    });

    await service.registerPublic(manualDto);

    expect(transaction.userIdentifierClaim.create).not.toHaveBeenCalled();
  });

  it('converts Prisma unique constraint violations into a safe conflict response', async () => {
    transaction.user.create.mockRejectedValue({
      code: 'P2002',
    });

    await expect(service.registerPublic(manualDto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('skips a collided generated username and advances the sequence safely', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      usernameMode: 'AUTO',
      usernamePrefixEnabled: true,
      usernamePrefix: 'FTZ',
    });

    transaction.user.findUnique
      .mockResolvedValueOnce({
        id: 'existing-user-id',
      })
      .mockResolvedValueOnce(null);

    transaction.user.create.mockResolvedValue({
      ...createdUser,
      username: 'ftz100002',
    });

    await service.registerPublic({
      email: manualDto.email,
      phone: manualDto.phone,
      password: manualDto.password,
    });

    expect(transaction.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        username: 'ftz100001',
      },
      select: {
        id: true,
      },
    });

    expect(transaction.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        username: 'ftz100002',
      },
      select: {
        id: true,
      },
    });

    expect(transaction.systemSequence.update).toHaveBeenCalledWith({
      where: {
        key: 'username',
      },
      data: {
        nextValue: 100003n,
      },
    });
  });
});
