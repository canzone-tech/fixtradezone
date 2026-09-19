import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { AUTH_USER_SELECT, type AuthenticatedUser } from './auth-user';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import * as publicUsernameUtil from './public-username.util';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { RegistrationService } from './registration.service';

describe('RegistrationService', () => {
  const createdUser = {
    id: 'new-user-id',
    email: 'user@example.com',
    username: 'a1b2c3d4',
    phone: '+919876543210',
    firstName: 'Prashant',
    lastName: 'Shukla',
    status: 'PENDING' as const,
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
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
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    userIdentifierClaim: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    systemRegistrationConfig: {
      findUnique: jest.fn(),
    },
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

  const referralsService = {
    enrollRegisteredUser: jest.fn(),
  };

  const emailVerificationService = {
    sendInitial: jest.fn(),
  };

  const defaultRole = {
    id: 'user-role-id',
    name: 'USER',
  };

  const publicDto = {
    email: 'user@example.com',
    username: 'Trader.One',
    phone: '+919876543210',
    password: 'SecurePassword123!',
    firstName: 'Prashant',
    lastName: 'Shukla',
    age18Declared: true,
    kycDeclarationAccepted: true,
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

  let service: RegistrationService;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    jest
      .spyOn(publicUsernameUtil, 'createRandomPublicUsername')
      .mockReturnValue('a1b2c3d4');

    prisma.systemRegistrationConfig.findUnique.mockResolvedValue(null);
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue(null);
    transaction.user.create.mockImplementation(
      async ({ data }: { data: { username: string } }) => ({
        ...createdUser,
        username: data.username,
      }),
    );
    transaction.user.findFirst.mockResolvedValue(null);
    transaction.user.findUnique.mockResolvedValue(null);
    transaction.userIdentifierClaim.create.mockResolvedValue({
      id: 'claim-id',
    });
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });
    passwordService.hash.mockResolvedValue('argon2-hash');
    passwordService.generateTemporaryPassword.mockReturnValue(
      'generated-temporary-password',
    );
    rbacBootstrapService.ensureDefaultUserRole.mockResolvedValue(defaultRole);
    referralsService.enrollRegisteredUser.mockResolvedValue({
      referralCode: 'FTZABC123',
      sponsorUserId: 'sponsor-user-id',
      source: 'DEFAULT_SPONSOR',
    });
    emailVerificationService.sendInitial.mockResolvedValue({ sent: true });

    service = new RegistrationService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
      referralsService as unknown as ReferralsService,
      emailVerificationService as unknown as EmailVerificationService,
    );
  });

  it('returns public policy with mandatory declarations and email verification', async () => {
    prisma.systemRegistrationConfig.findUnique.mockResolvedValue({
      publicRegistrationEnabled: true,
      emailRequired: false,
      mobileRequired: true,
      passwordMode: 'AUTO',
      usernameMode: 'AUTO',
      usernamePrefixEnabled: true,
      usernamePrefix: 'ftz',
    });

    await expect(service.getPublicRegistrationPolicy()).resolves.toEqual({
      publicRegistrationEnabled: true,
      emailRequired: true,
      mobileRequired: false,
      passwordMode: 'AUTO',
      usernameMode: 'AUTO',
      usernamePrefixEnabled: true,
      usernamePrefix: 'ftz',
      age18DeclarationRequired: true,
      kycDeclarationRequired: true,
      emailVerificationRequired: true,
      declarationPolicyVersion: 'CLIENT_REVISION_2026_09_V1',
    });
  });

  it('registers a public user with an 8-character generated username and ignores a supplied username', async () => {
    const result = await service.registerPublic(publicDto, {
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    });

    expect(transaction.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: { id: true },
    });
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: publicDto.email,
        username: 'a1b2c3d4',
        phone: publicDto.phone,
        passwordHash: 'argon2-hash',
        mustChangePassword: false,
        firstName: publicDto.firstName,
        lastName: publicDto.lastName,
        status: 'PENDING',
        roles: {
          create: {
            role: {
              connect: { id: defaultRole.id },
            },
          },
        },
      },
      select: AUTH_USER_SELECT,
    });
    expect(referralsService.enrollRegisteredUser).toHaveBeenCalledWith(
      transaction,
      { id: createdUser.id, username: 'a1b2c3d4' },
      undefined,
    );
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
          generatedUsername: true,
          generatedPassword: false,
          declarationPolicyVersion: 'CLIENT_REVISION_2026_09_V1',
          age18Declared: true,
          kycDeclarationAccepted: true,
          emailVerificationRequired: true,
          duplicateAccountAction: 'ALLOWED',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });
    expect(emailVerificationService.sendInitial).toHaveBeenCalledWith(
      expect.objectContaining({ id: createdUser.id, email: createdUser.email }),
      { ipAddress: '127.0.0.1', userAgent: 'Jest' },
    );
    expect(result).toMatchObject({
      emailVerificationRequired: true,
      verificationEmailSent: true,
      verificationStatus: 'PENDING_EMAIL_VERIFICATION',
      duplicateAccountAction: 'ALLOWED',
      user: {
        id: createdUser.id,
        username: 'a1b2c3d4',
        status: 'PENDING',
      },
      referral: {
        sponsorUserId: 'sponsor-user-id',
      },
    });
  });

  it('retries random username allocation after a collision', async () => {
    const generator = jest.spyOn(
      publicUsernameUtil,
      'createRandomPublicUsername',
    );
    generator
      .mockReturnValueOnce('a1b2c3d4')
      .mockReturnValueOnce('z9y8x7w6');
    transaction.user.findUnique
      .mockResolvedValueOnce({ id: 'collision-user-id' })
      .mockResolvedValueOnce(null);

    const result = await service.registerPublic({
      ...publicDto,
      username: undefined,
    });

    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: 'z9y8x7w6' }),
      }),
    );
    expect(result.user.username).toBe('z9y8x7w6');
  });

  it('fails closed when referral enrollment is disabled or unavailable', async () => {
    referralsService.enrollRegisteredUser.mockResolvedValue(null);

    await expect(service.registerPublic(publicDto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(emailVerificationService.sendInitial).not.toHaveBeenCalled();
  });

  it('fails closed when the referral service is unavailable', async () => {
    const serviceWithoutReferrals = new RegistrationService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      rbacBootstrapService as unknown as RbacBootstrapService,
      undefined,
      emailVerificationService as unknown as EmailVerificationService,
    );

    await expect(
      serviceWithoutReferrals.registerPublic(publicDto),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('does not roll back registration when initial email delivery fails', async () => {
    emailVerificationService.sendInitial.mockResolvedValue({ sent: false });

    const result = await service.registerPublic(publicDto);

    expect(result).toMatchObject({
      emailVerificationRequired: true,
      verificationEmailSent: false,
      verificationStatus: 'PENDING_EMAIL_VERIFICATION',
    });
    expect(transaction.user.create).toHaveBeenCalledTimes(1);
  });

  it('requires both public registration declarations', async () => {
    await expect(
      service.registerPublic({
        ...publicDto,
        age18Declared: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.registerPublic({
        ...publicDto,
        kycDeclarationAccepted: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('requires an email for public registration even when legacy config marks it optional', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      emailRequired: false,
    });

    await expect(
      service.registerPublic({
        username: 'trader.one',
        password: 'SecurePassword123!',
        age18Declared: true,
        kycDeclarationAccepted: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps mobile optional for public registration even when legacy config marks it required', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      mobileRequired: true,
    });

    await expect(
      service.registerPublic({
        ...publicDto,
        phone: undefined,
      }),
    ).resolves.toMatchObject({
      user: {
        id: createdUser.id,
      },
    });

    expect(transaction.user.create).toHaveBeenCalledTimes(1);
    expect(transaction.userIdentifierClaim.create).toHaveBeenCalledTimes(1);
  });

  it('hard rejects a public duplicate email before creating the user', async () => {
    transaction.user.findFirst.mockResolvedValue({ id: 'existing-user-id' });

    await expect(service.registerPublic(publicDto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('keeps public email uniqueness even if the legacy multiple-email flag is enabled', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      allowMultipleAccountsPerEmail: true,
    });

    await service.registerPublic(publicDto);

    expect(transaction.userIdentifierClaim.create).toHaveBeenCalledWith({
      data: {
        userId: createdUser.id,
        type: 'EMAIL',
        normalizedValue: 'user@example.com',
      },
    });
  });

  it('rejects public registration when disabled', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      publicRegistrationEnabled: false,
    });

    await expect(service.registerPublic(publicDto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it('preserves dashboard username behavior for SUPER_ADMIN-created users', async () => {
    await service.registerDashboard(
      {
        email: publicDto.email,
        username: publicDto.username,
        phone: publicDto.phone,
        password: publicDto.password,
      },
      superAdminActor,
    );

    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: 'trader.one' }),
      }),
    );
    expect(emailVerificationService.sendInitial).not.toHaveBeenCalled();
  });

  it('maps Prisma uniqueness failures to the safe conflict response', async () => {
    transaction.userIdentifierClaim.create.mockRejectedValue({ code: 'P2002' });

    await expect(service.registerPublic(publicDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
