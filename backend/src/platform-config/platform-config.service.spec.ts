import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { PlatformConfigService } from './platform-config.service';
import { UpdateRegistrationConfigDto } from './update-registration-config.dto';

describe('PlatformConfigService', () => {
  const firstUpdatedAt = new Date('2026-08-22T00:00:00.000Z');

  const secondUpdatedAt = new Date('2026-08-22T01:00:00.000Z');

  const authenticationRow = {
    id: 1,
    loginWithUsername: true,
    loginWithEmail: true,
    loginWithMobile: true,
    captchaOnLoginEnabled: false,
    captchaOnRegistrationEnabled: false,
    updatedByUserId: null,
    createdAt: firstUpdatedAt,
    updatedAt: firstUpdatedAt,
  };

  const registrationRow = {
    id: 1,
    publicRegistrationEnabled: true,
    superAdminRegistrationEnabled: true,
    adminRegistrationEnabled: true,
    authorizedUserRegistrationEnabled: false,
    emailRequired: true,
    mobileRequired: false,
    passwordMode: 'MANUAL' as const,
    usernameMode: 'AUTO_OR_MANUAL' as const,
    usernamePrefixEnabled: false,
    usernamePrefix: null,
    allowMultipleAccountsPerEmail: false,
    allowMultipleAccountsPerMobile: false,
    updatedByUserId: null,
    createdAt: firstUpdatedAt,
    updatedAt: firstUpdatedAt,
  };

  const transaction = {
    systemAuthConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    systemRegistrationConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userIdentifierClaim: {
      deleteMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const prisma = {
    systemAuthConfig: {
      findUnique: jest.fn(),
    },
    systemRegistrationConfig: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  const superAdmin: AuthenticatedUser = {
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

  const admin: AuthenticatedUser = {
    ...superAdmin,
    id: 'admin-id',
    username: 'admin',
    roles: ['ADMIN'],
  };

  let service: PlatformConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.systemAuthConfig.findUnique.mockResolvedValue(authenticationRow);

    prisma.systemRegistrationConfig.findUnique.mockResolvedValue(
      registrationRow,
    );

    transaction.systemAuthConfig.findUnique.mockResolvedValue(
      authenticationRow,
    );

    transaction.systemRegistrationConfig.findUnique.mockResolvedValue(
      registrationRow,
    );

    transaction.systemAuthConfig.upsert.mockResolvedValue(authenticationRow);

    transaction.systemRegistrationConfig.upsert.mockResolvedValue(
      registrationRow,
    );

    transaction.userIdentifierClaim.deleteMany.mockResolvedValue({
      count: 0,
    });

    transaction.auditLog.create.mockResolvedValue({
      id: 'audit-id',
    });

    transaction.$queryRaw.mockResolvedValue([]);
    transaction.$executeRaw.mockResolvedValue(0);

    service = new PlatformConfigService(prisma as unknown as PrismaService);
  });

  it('returns safe defaults when configuration rows do not exist', async () => {
    prisma.systemAuthConfig.findUnique.mockResolvedValue(null);
    prisma.systemRegistrationConfig.findUnique.mockResolvedValue(null);

    await expect(service.getAuthentication()).resolves.toEqual({
      loginWithUsername: true,
      loginWithEmail: true,
      loginWithMobile: true,
      captchaOnLoginEnabled: false,
      captchaOnRegistrationEnabled: false,
      updatedAt: null,
    });

    await expect(service.getRegistration()).resolves.toEqual({
      publicRegistrationEnabled: true,
      superAdminRegistrationEnabled: true,
      adminRegistrationEnabled: true,
      authorizedUserRegistrationEnabled: false,
      emailRequired: true,
      mobileRequired: false,
      passwordMode: 'MANUAL',
      usernameMode: 'AUTO_OR_MANUAL',
      usernamePrefixEnabled: false,
      usernamePrefix: null,
      allowMultipleAccountsPerEmail: false,
      allowMultipleAccountsPerMobile: false,
      updatedAt: null,
    });
  });

  it('rejects platform configuration mutation by non-SUPER_ADMIN users', async () => {
    await expect(
      service.updateAuthentication(
        {
          loginWithEmail: false,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.updateRegistration(
        {
          publicRegistrationEnabled: false,
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an empty authentication update', async () => {
    await expect(
      service.updateAuthentication({}, superAdmin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects disabling every login method', async () => {
    await expect(
      service.updateAuthentication(
        {
          loginWithUsername: false,
          loginWithEmail: false,
          loginWithMobile: false,
        },
        superAdmin,
      ),
    ).rejects.toThrow('At least one login method must remain enabled.');

    expect(transaction.systemAuthConfig.upsert).not.toHaveBeenCalled();

    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects non-username authentication while multi-account mode is active', async () => {
    transaction.systemAuthConfig.findUnique.mockResolvedValue({
      ...authenticationRow,
      loginWithUsername: true,
      loginWithEmail: false,
      loginWithMobile: false,
    });

    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      ...registrationRow,
      allowMultipleAccountsPerEmail: true,
    });

    await expect(
      service.updateAuthentication(
        {
          loginWithEmail: true,
        },
        superAdmin,
      ),
    ).rejects.toThrow('Multi-account mode requires username-only login.');

    expect(transaction.systemAuthConfig.upsert).not.toHaveBeenCalled();
  });

  it('updates authentication configuration transactionally and audits before and after policy', async () => {
    const updatedRow = {
      ...authenticationRow,
      loginWithEmail: false,
      captchaOnLoginEnabled: true,
      updatedByUserId: superAdmin.id,
      updatedAt: secondUpdatedAt,
    };

    transaction.systemAuthConfig.upsert.mockResolvedValue(updatedRow);

    const result = await service.updateAuthentication(
      {
        loginWithEmail: false,
        captchaOnLoginEnabled: true,
      },
      superAdmin,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    );

    expect(transaction.systemAuthConfig.upsert).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      create: {
        id: 1,
        loginWithUsername: true,
        loginWithEmail: false,
        loginWithMobile: true,
        captchaOnLoginEnabled: true,
        captchaOnRegistrationEnabled: false,
        updatedByUserId: superAdmin.id,
      },
      update: {
        loginWithUsername: true,
        loginWithEmail: false,
        loginWithMobile: true,
        captchaOnLoginEnabled: true,
        captchaOnRegistrationEnabled: false,
        updatedByUserId: superAdmin.id,
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: superAdmin.id,
        action: 'UPDATE',
        entityType: 'SystemAuthConfig',
        entityId: '1',
        description:
          'SUPER_ADMIN updated platform authentication configuration.',
        metadata: {
          source: 'ADMIN_AUTHENTICATION_CONFIG',
          previous: {
            loginWithUsername: true,
            loginWithEmail: true,
            loginWithMobile: true,
            captchaOnLoginEnabled: false,
            captchaOnRegistrationEnabled: false,
          },
          current: {
            loginWithUsername: true,
            loginWithEmail: false,
            loginWithMobile: true,
            captchaOnLoginEnabled: true,
            captchaOnRegistrationEnabled: false,
          },
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });

    expect(result).toEqual({
      message: 'Authentication configuration updated.',
      loginWithUsername: true,
      loginWithEmail: false,
      loginWithMobile: true,
      captchaOnLoginEnabled: true,
      captchaOnRegistrationEnabled: false,
      updatedAt: secondUpdatedAt,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects an empty registration update', async () => {
    await expect(
      service.updateRegistration({}, superAdmin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid username prefix when prefixing is enabled', async () => {
    await expect(
      service.updateRegistration(
        {
          usernamePrefixEnabled: true,
          usernamePrefix: 'bad prefix',
        },
        superAdmin,
      ),
    ).rejects.toThrow(
      'A valid username prefix is required when username prefixing is enabled.',
    );

    expect(transaction.systemRegistrationConfig.upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid password creation mode defensively', async () => {
    const invalidSettings = new UpdateRegistrationConfigDto();

    Object.defineProperty(invalidSettings, 'passwordMode', {
      value: 'INVALID',
      enumerable: true,
    });

    await expect(
      service.updateRegistration(invalidSettings, superAdmin),
    ).rejects.toThrow('Invalid password creation mode.');

    expect(transaction.systemRegistrationConfig.upsert).not.toHaveBeenCalled();
  });

  it('requires username-only authentication before enabling multi-account mode', async () => {
    await expect(
      service.updateRegistration(
        {
          allowMultipleAccountsPerEmail: true,
        },
        superAdmin,
      ),
    ).rejects.toThrow(
      'Enable username-only authentication before enabling multi-account mode.',
    );

    expect(transaction.userIdentifierClaim.deleteMany).not.toHaveBeenCalled();

    expect(transaction.systemRegistrationConfig.upsert).not.toHaveBeenCalled();
  });

  it('deletes email claim locks when switching from single-account to multi-account email mode', async () => {
    transaction.systemAuthConfig.findUnique.mockResolvedValue({
      ...authenticationRow,
      loginWithUsername: true,
      loginWithEmail: false,
      loginWithMobile: false,
    });

    transaction.systemRegistrationConfig.upsert.mockResolvedValue({
      ...registrationRow,
      allowMultipleAccountsPerEmail: true,
      updatedAt: secondUpdatedAt,
    });

    await service.updateRegistration(
      {
        allowMultipleAccountsPerEmail: true,
      },
      superAdmin,
    );

    expect(transaction.userIdentifierClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        type: 'EMAIL',
      },
    });

    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects multi-account to single-account email transition while duplicate emails exist', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      ...registrationRow,
      allowMultipleAccountsPerEmail: true,
    });

    transaction.$queryRaw.mockResolvedValue([
      {
        normalizedValue: 'shared@example.com',
      },
    ]);

    await expect(
      service.updateRegistration(
        {
          allowMultipleAccountsPerEmail: false,
        },
        superAdmin,
      ),
    ).rejects.toThrow(
      'Single-account email mode cannot be enabled while duplicate email addresses exist.',
    );

    expect(transaction.userIdentifierClaim.deleteMany).not.toHaveBeenCalled();

    expect(transaction.$executeRaw).not.toHaveBeenCalled();

    expect(transaction.systemRegistrationConfig.upsert).not.toHaveBeenCalled();
  });

  it('rebuilds email claim locks when safely switching multi-account email mode back to single-account', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      ...registrationRow,
      allowMultipleAccountsPerEmail: true,
    });

    transaction.$queryRaw.mockResolvedValue([]);

    transaction.systemRegistrationConfig.upsert.mockResolvedValue({
      ...registrationRow,
      allowMultipleAccountsPerEmail: false,
      updatedAt: secondUpdatedAt,
    });

    await service.updateRegistration(
      {
        allowMultipleAccountsPerEmail: false,
      },
      superAdmin,
    );

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);

    expect(transaction.userIdentifierClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        type: 'EMAIL',
      },
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);

    expect(transaction.systemRegistrationConfig.upsert).toHaveBeenCalledTimes(
      1,
    );
  });

  it('normalizes registration prefix and audits the complete policy transition', async () => {
    const updatedRow = {
      ...registrationRow,
      publicRegistrationEnabled: false,
      usernamePrefixEnabled: true,
      usernamePrefix: 'ftz',
      updatedByUserId: superAdmin.id,
      updatedAt: secondUpdatedAt,
    };

    transaction.systemRegistrationConfig.upsert.mockResolvedValue(updatedRow);

    const result = await service.updateRegistration(
      {
        publicRegistrationEnabled: false,
        usernamePrefixEnabled: true,
        usernamePrefix: ' FTZ ',
      },
      superAdmin,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    );

    expect(transaction.systemRegistrationConfig.upsert).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      create: {
        id: 1,
        publicRegistrationEnabled: false,
        superAdminRegistrationEnabled: true,
        adminRegistrationEnabled: true,
        authorizedUserRegistrationEnabled: false,
        emailRequired: true,
        mobileRequired: false,
        passwordMode: 'MANUAL',
        usernameMode: 'AUTO_OR_MANUAL',
        usernamePrefixEnabled: true,
        usernamePrefix: 'ftz',
        allowMultipleAccountsPerEmail: false,
        allowMultipleAccountsPerMobile: false,
        updatedByUserId: superAdmin.id,
      },
      update: {
        publicRegistrationEnabled: false,
        superAdminRegistrationEnabled: true,
        adminRegistrationEnabled: true,
        authorizedUserRegistrationEnabled: false,
        emailRequired: true,
        mobileRequired: false,
        passwordMode: 'MANUAL',
        usernameMode: 'AUTO_OR_MANUAL',
        usernamePrefixEnabled: true,
        usernamePrefix: 'ftz',
        allowMultipleAccountsPerEmail: false,
        allowMultipleAccountsPerMobile: false,
        updatedByUserId: superAdmin.id,
      },
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: superAdmin.id,
        action: 'UPDATE',
        entityType: 'SystemRegistrationConfig',
        entityId: '1',
        description: 'SUPER_ADMIN updated platform registration configuration.',
        metadata: {
          source: 'ADMIN_REGISTRATION_CONFIG',
          previous: {
            publicRegistrationEnabled: true,
            superAdminRegistrationEnabled: true,
            adminRegistrationEnabled: true,
            authorizedUserRegistrationEnabled: false,
            emailRequired: true,
            mobileRequired: false,
            passwordMode: 'MANUAL',
            usernameMode: 'AUTO_OR_MANUAL',
            usernamePrefixEnabled: false,
            usernamePrefix: null,
            allowMultipleAccountsPerEmail: false,
            allowMultipleAccountsPerMobile: false,
          },
          current: {
            publicRegistrationEnabled: false,
            superAdminRegistrationEnabled: true,
            adminRegistrationEnabled: true,
            authorizedUserRegistrationEnabled: false,
            emailRequired: true,
            mobileRequired: false,
            passwordMode: 'MANUAL',
            usernameMode: 'AUTO_OR_MANUAL',
            usernamePrefixEnabled: true,
            usernamePrefix: 'ftz',
            allowMultipleAccountsPerEmail: false,
            allowMultipleAccountsPerMobile: false,
          },
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });

    expect(result).toEqual({
      message: 'Registration configuration updated.',
      publicRegistrationEnabled: false,
      superAdminRegistrationEnabled: true,
      adminRegistrationEnabled: true,
      authorizedUserRegistrationEnabled: false,
      emailRequired: true,
      mobileRequired: false,
      passwordMode: 'MANUAL',
      usernameMode: 'AUTO_OR_MANUAL',
      usernamePrefixEnabled: true,
      usernamePrefix: 'ftz',
      allowMultipleAccountsPerEmail: false,
      allowMultipleAccountsPerMobile: false,
      updatedAt: secondUpdatedAt,
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});
