import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from './auth-user';
import { OwnProfileService } from './own-profile.service';

const activeUser: AuthenticatedUser = {
  id: 'user-id',
  email: 'user@example.com',
  username: 'ftz100001',
  phone: null,
  firstName: null,
  lastName: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-09-03T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
};

const authRecord = {
  id: activeUser.id,
  email: activeUser.email,
  username: activeUser.username,
  phone: '+919876543210',
  firstName: 'Prashant',
  lastName: 'Shukla',
  status: 'ACTIVE' as const,
  createdAt: activeUser.createdAt,
  lastLoginAt: activeUser.lastLoginAt,
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

const withdrawalRow = {
  userId: activeUser.id,
  asset: 'USDT',
  networkCode: 'BEP20',
  validationProfile: 'EVM',
  destinationAddress: '0x1111111111111111111111111111111111111111',
  savedAt: new Date('2026-09-20T00:00:00.000Z'),
  lockedUntil: new Date('2026-10-20T00:00:00.000Z'),
  revision: 1,
  createdAt: new Date('2026-09-20T00:00:00.000Z'),
  updatedAt: new Date('2026-09-20T00:00:00.000Z'),
};

describe('OwnProfileService', () => {
  const transaction = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    systemRegistrationConfig: {
      findUnique: jest.fn(),
    },
    userIdentifierClaim: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: OwnProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.user.findUnique.mockResolvedValue({
      id: activeUser.id,
      status: 'ACTIVE',
      firstName: null,
      lastName: null,
      phone: null,
      emailVerifiedAt: new Date('2026-09-03T00:00:00.000Z'),
    });
    transaction.user.findFirst.mockResolvedValue(null);
    transaction.user.update.mockResolvedValue(authRecord);
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      allowMultipleAccountsPerMobile: false,
    });
    transaction.userIdentifierClaim.deleteMany.mockResolvedValue({ count: 0 });
    transaction.userIdentifierClaim.create.mockResolvedValue({
      id: 'claim-id',
    });
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });
    transaction.$queryRawUnsafe.mockResolvedValue([]);
    transaction.$executeRaw.mockResolvedValue(1);
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    service = new OwnProfileService(prisma as unknown as PrismaService);
  });

  it('updates profile fields and creates a mobile uniqueness claim', async () => {
    const result = await service.update(
      activeUser,
      {
        firstName: 'Prashant',
        lastName: 'Shukla',
        phone: '+919876543210',
      },
      { ipAddress: '127.0.0.1', userAgent: 'Jest' },
    );

    expect(transaction.userIdentifierClaim.create).toHaveBeenCalledWith({
      data: {
        userId: activeUser.id,
        type: 'MOBILE',
        normalizedValue: '+919876543210',
      },
    });
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: activeUser.id },
        data: {
          firstName: 'Prashant',
          lastName: 'Shukla',
          phone: '+919876543210',
        },
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: activeUser.id,
        action: 'UPDATE',
        entityType: 'User',
        entityId: activeUser.id,
        description: 'User updated profile details.',
        metadata: {
          source: 'SELF_PROFILE',
          changedFields: ['firstName', 'lastName', 'phone'],
          withdrawalNetwork: null,
          withdrawalAddressLockedUntil: null,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });
    expect(result.user).toMatchObject({
      firstName: 'Prashant',
      lastName: 'Shukla',
      phone: '+919876543210',
    });
  });

  it('allows profile identity fields to be cleared', async () => {
    transaction.user.findUnique.mockResolvedValue({
      id: activeUser.id,
      status: 'ACTIVE',
      firstName: 'Prashant',
      lastName: 'Shukla',
      phone: '+919876543210',
      emailVerifiedAt: new Date('2026-09-03T00:00:00.000Z'),
    });
    transaction.user.update.mockResolvedValue({
      ...authRecord,
      firstName: null,
      lastName: null,
      phone: null,
    });

    await service.update(activeUser, {
      firstName: null,
      lastName: null,
      phone: null,
    });

    expect(transaction.userIdentifierClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: activeUser.id,
        type: 'MOBILE',
      },
    });
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          firstName: null,
          lastName: null,
          phone: null,
        },
      }),
    );
  });

  it('rejects a duplicate mobile when multiple mobile accounts are disabled', async () => {
    transaction.user.findFirst.mockResolvedValue({ id: 'other-user-id' });

    await expect(
      service.update(activeUser, { phone: '+919876543210' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.user.update).not.toHaveBeenCalled();
  });

  it('respects the existing multiple-mobile configuration when enabled', async () => {
    transaction.systemRegistrationConfig.findUnique.mockResolvedValue({
      allowMultipleAccountsPerMobile: true,
    });

    await service.update(activeUser, { phone: '+919876543210' });

    expect(transaction.user.findFirst).not.toHaveBeenCalled();
    expect(transaction.userIdentifierClaim.create).not.toHaveBeenCalled();
    expect(transaction.user.update).toHaveBeenCalled();
  });

  it('saves the first BEP-20 withdrawal address with a 30-day lock', async () => {
    transaction.$queryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([withdrawalRow]);

    const result = await service.update(activeUser, {
      withdrawalAddress: withdrawalRow.destinationAddress,
    });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalled();
    expect(result.profileCompletion).toMatchObject({
      withdrawal: {
        asset: 'USDT',
        networkCode: 'BEP20',
        address: withdrawalRow.destinationAddress,
        lockDays: 30,
      },
    });
  });

  it('blocks a withdrawal address change while the 30-day lock is active', async () => {
    transaction.$queryRawUnsafe.mockResolvedValueOnce([withdrawalRow]);

    await expect(
      service.update(activeUser, {
        withdrawalAddress: '0x2222222222222222222222222222222222222222',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });
});
