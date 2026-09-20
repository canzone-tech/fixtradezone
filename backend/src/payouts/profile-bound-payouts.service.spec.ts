import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import type { CreatePayoutDto } from './dto/payout.dto';
import type { PayoutAccountingService } from './payout-accounting.service';
import type { PayoutPolicyService } from './payout-policy.service';
import { PayoutsService } from './payouts.service';
import { ProfileBoundPayoutsService } from './profile-bound-payouts.service';

const actor: AuthenticatedUser = {
  id: 'user-id',
  email: 'user@example.com',
  username: 'ftz100001',
  phone: '+919876543210',
  firstName: 'Profile',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
};

const dto: CreatePayoutDto = {
  requestKey: '11111111-1111-4111-8111-111111111111',
  sourceBucket: 'TOTAL_WALLET',
  amount: '25',
  destinationAddress: '0x1111111111111111111111111111111111111111',
};

const completeProfile = {
  destinationAddress: dto.destinationAddress,
  asset: 'USDT',
  networkCode: 'BEP20',
  validationProfile: 'EVM',
  firstName: 'Profile',
  lastName: 'User',
  phone: '+919876543210',
};

describe('ProfileBoundPayoutsService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };
  const payoutPolicy = {} as PayoutPolicyService;
  const payoutAccounting = {} as PayoutAccountingService;
  let service: ProfileBoundPayoutsService;
  let baseCreateRequest: jest.SpiedFunction<PayoutsService['createRequest']>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProfileBoundPayoutsService(
      prisma as unknown as PrismaService,
      payoutPolicy,
      payoutAccounting,
    );
    baseCreateRequest = jest
      .spyOn(PayoutsService.prototype, 'createRequest')
      .mockResolvedValue({ created: true } as never);
  });

  afterEach(() => {
    baseCreateRequest.mockRestore();
  });

  it('rejects payout when required personal details are incomplete', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        ...completeProfile,
        lastName: null,
      },
    ]);

    await expect(service.createRequest(dto, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(baseCreateRequest).not.toHaveBeenCalled();
  });

  it('rejects payout when the submitted destination differs from My Profile', async () => {
    prisma.$queryRaw.mockResolvedValue([completeProfile]);

    await expect(
      service.createRequest(
        {
          ...dto,
          destinationAddress: '0x2222222222222222222222222222222222222222',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(baseCreateRequest).not.toHaveBeenCalled();
  });

  it('uses the saved profile address as the immutable payout destination', async () => {
    prisma.$queryRaw.mockResolvedValue([completeProfile]);

    await service.createRequest(dto, actor, {
      ipAddress: '127.0.0.1',
      userAgent: 'Jest',
    });

    expect(baseCreateRequest).toHaveBeenCalledWith(
      {
        ...dto,
        destinationAddress: completeProfile.destinationAddress,
      },
      actor,
      {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    );
  });
});
