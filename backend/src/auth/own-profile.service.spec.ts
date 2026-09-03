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
  };

  const prisma = {
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

    service = new OwnProfileService(prisma as unknown as PrismaService);
  });

  it('updates optional profile fields and creates a mobile uniqueness claim', async () => {
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
        description: 'User updated optional profile details.',
        metadata: {
          source: 'SELF_PROFILE',
          changedFields: ['firstName', 'lastName', 'phone'],
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

  it('allows optional profile fields to be cleared', async () => {
    transaction.user.findUnique.mockResolvedValue({
      id: activeUser.id,
      status: 'ACTIVE',
      firstName: 'Prashant',
      lastName: 'Shukla',
      phone: '+919876543210',
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
});
