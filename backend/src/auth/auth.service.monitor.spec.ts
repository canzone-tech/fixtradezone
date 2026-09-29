import { PrismaService } from '../database/prisma.service';
import { DuplicateAccountService } from '../duplicate-account/duplicate-account.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RegistrationService } from './registration.service';
import { TokenService } from './token.service';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';

describe('AuthService MONITOR-mode refresh', () => {
  const activeUser = {
    id: 'user-id',
    email: 'user@example.com',
    username: 'trader.one',
    phone: '+919876543210',
    firstName: 'Prashant',
    lastName: 'Shukla',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-18T00:00:00.000Z'),
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
  const issuedTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenHash: 'refresh-token-hash',
    refreshTokenExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
    sessionId: 'new-session-id',
  };
  const transaction = {
    authSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  const prisma = {
    authSession: {
      findFirst: jest.fn(),
    },
    systemDuplicateAccountConfig: {
      findUnique: jest.fn(),
    },
    userDeviceInstallation: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  const passwordService = {};
  const registrationService = {};
  const tokenService = {
    verifyRefreshToken: jest.fn(),
    hashRefreshToken: jest.fn(),
    issueTokenPair: jest.fn(),
  };
  const duplicateAccountService = {
    evaluateLogin: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.authSession.updateMany.mockResolvedValue({ count: 1 });
    transaction.$executeRaw.mockResolvedValue(1);
    prisma.authSession.findFirst.mockResolvedValue({
      id: 'old-session-id',
      userId: activeUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: activeUser,
    });
    prisma.systemDuplicateAccountConfig.findUnique.mockResolvedValue({
      enforcementMode: 'MONITOR',
      deviceSignalEnabled: true,
    });
    prisma.userDeviceInstallation.findUnique.mockResolvedValue(null);
    tokenService.verifyRefreshToken.mockResolvedValue({
      sub: activeUser.id,
      type: 'refresh',
      jti: 'old-session-id',
    });
    tokenService.hashRefreshToken.mockReturnValue('old-token-hash');
    tokenService.issueTokenPair.mockResolvedValue(issuedTokens);
    duplicateAccountService.evaluateLogin.mockResolvedValue({
      enforcementMode: 'MONITOR',
      action: 'MONITORED',
      blockLogin: false,
      bindDevice: false,
      matchedUserIds: [],
      deviceInstallationId: DEVICE_ID,
      ipAddress: null,
      reason: 'USER_DEVICE_LIMIT_REACHED',
    });

    service = new AuthService(
      prisma as unknown as PrismaService,
      passwordService as PasswordService,
      registrationService as RegistrationService,
      tokenService as unknown as TokenService,
      duplicateAccountService as unknown as DuplicateAccountService,
    );
  });

  it('keeps a MONITOR-mode bound session refreshable when the device is observed but not approved', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        deviceInstallationId: DEVICE_ID,
        deviceBindingPending: false,
      },
    ]);

    await expect(
      service.refresh({
        refreshToken: 'old-token',
        deviceInstallationId: DEVICE_ID,
      }),
    ).resolves.toMatchObject({ message: 'Session refreshed.' });

    expect(prisma.userDeviceInstallation.findUnique).toHaveBeenCalled();
    expect(transaction.authSession.create).toHaveBeenCalled();
  });

  it('keeps a MONITOR-mode unbound session refreshable when the device signal is absent', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        deviceInstallationId: null,
        deviceBindingPending: false,
      },
    ]);

    await expect(
      service.refresh({ refreshToken: 'old-token' }),
    ).resolves.toMatchObject({ message: 'Session refreshed.' });

    expect(prisma.userDeviceInstallation.findUnique).not.toHaveBeenCalled();
    expect(transaction.authSession.create).toHaveBeenCalled();
  });
});
