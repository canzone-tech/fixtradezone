import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';

describe('AuthService pending email verification login', () => {
  const pendingUser = {
    id: 'pending-user-id',
    email: 'pending@example.com',
    emailVerifiedAt: null,
    username: 'pending.user',
    phone: null,
    firstName: 'Pending',
    lastName: 'User',
    status: 'PENDING' as const,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
    lastLoginAt: null,
    passwordHash: 'argon2-hash',
    mustChangePassword: false,
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

  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    systemAuthConfig: {
      findUnique: jest.fn(),
    },
    systemRegistrationConfig: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const passwordService = {
    verifyForAuthentication: jest.fn(),
  };

  const registrationService = {
    registerPublic: jest.fn(),
  };

  const tokenService = {
    issueTokenPair: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.systemAuthConfig.findUnique.mockResolvedValue(null);
    prisma.systemRegistrationConfig.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(pendingUser);
    prisma.user.findMany.mockResolvedValue([pendingUser]);

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as unknown as PasswordService,
      registrationService as unknown as RegistrationService,
      tokenService as unknown as TokenService,
    );
  });

  it('returns a clear verification-pending message for the signup email after the correct password is proven', async () => {
    passwordService.verifyForAuthentication.mockResolvedValue(true);

    await expect(
      service.login({
        identifier: pendingUser.email,
        password: 'CorrectPassword123!',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Email verification pending. Please verify your email before signing in.',
      },
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: pendingUser.email },
        take: 2,
      }),
    );
    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let multiple-account or disabled-email-login policy mask the pending-verification message after credential proof', async () => {
    prisma.systemRegistrationConfig.findUnique.mockResolvedValue({
      allowMultipleAccountsPerEmail: true,
      allowMultipleAccountsPerMobile: false,
    });
    prisma.systemAuthConfig.findUnique.mockResolvedValue({
      loginWithUsername: true,
      loginWithEmail: false,
      loginWithMobile: true,
    });
    passwordService.verifyForAuthentication.mockResolvedValue(true);

    await expect(
      service.login({
        identifier: pendingUser.email,
        password: 'CorrectPassword123!',
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          'Email verification pending. Please verify your email before signing in.',
      },
    });

    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the generic credential error when the password is incorrect', async () => {
    passwordService.verifyForAuthentication.mockResolvedValue(false);

    await expect(
      service.login({
        identifier: pendingUser.email,
        password: 'WrongPassword123!',
      }),
    ).rejects.toMatchObject({
      response: {
        message: 'Invalid login credentials.',
      },
    });

    expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
