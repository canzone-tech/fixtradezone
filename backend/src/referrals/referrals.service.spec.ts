import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { ReferralsService } from './referrals.service';

describe('ReferralsService', () => {
  const transaction = {
    systemReferralConfig: {
      findUnique: jest.fn(),
    },
    referralProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    referralSponsorHistory: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    referralProfile: {
      findUnique: jest.fn(),
    },
    systemReferralConfig: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (operation: unknown) => {
      if (typeof operation === 'function') {
        return (operation as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        );
      }
      return operation;
    }),
  };

  const user: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
    username: 'user',
    phone: null,
    firstName: null,
    lastName: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    lastLoginAt: null,
    roles: ['USER'],
    permissions: [],
  };

  let service: ReferralsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReferralsService(prisma as unknown as PrismaService);
  });

  it('returns an explicit unassigned state when an existing user has no referral profile', async () => {
    prisma.referralProfile.findUnique.mockResolvedValue(null);

    await expect(service.getMine(user)).resolves.toEqual({
      enrolled: false,
      assignmentStatus: 'UNASSIGNED',
      referralCode: null,
      sponsor: null,
    });
  });

  it('does not create a referral profile during registration while enrollment is disabled', async () => {
    transaction.systemReferralConfig.findUnique.mockResolvedValue({
      enrollmentEnabled: false,
    });

    await expect(
      service.enrollRegisteredUser(
        transaction as never,
        { id: user.id, username: user.username },
        'ABC123',
      ),
    ).resolves.toBeNull();

    expect(transaction.referralProfile.create).not.toHaveBeenCalled();
  });

  it('rejects self-sponsorship before changing referral state', async () => {
    transaction.systemReferralConfig.findUnique.mockResolvedValue({
      adminSponsorChangeEnabled: true,
    });

    const admin: AuthenticatedUser = {
      ...user,
      roles: ['ADMIN'],
      permissions: ['referrals.sponsor.manage'],
    };

    await expect(
      service.assignSponsor(user.id, user.id, 'invalid self sponsor', admin),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.referralProfile.upsert).not.toHaveBeenCalled();
  });
});
