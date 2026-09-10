import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { DepositApprovalModeService } from './deposit-approval-mode.service';

const RAIL_ID = '11111111-1111-4111-8111-111111111111';

const superAdmin: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'founder@example.com',
  username: 'founder',
  phone: null,
  firstName: 'Founder',
  lastName: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

const admin: AuthenticatedUser = {
  ...superAdmin,
  id: '33333333-3333-4333-8333-333333333333',
  username: 'admin',
  email: 'admin@example.com',
  roles: ['ADMIN'],
  permissions: ['deposits.accounts.manage'],
};

describe('DepositApprovalModeService', () => {
  const prisma = {
    depositPaymentRail: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: DepositApprovalModeService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.depositPaymentRail.findUnique.mockResolvedValue({
      id: RAIL_ID,
      asset: 'USDT',
      networkCode: 'BEP20',
      displayName: 'USDT on BNB Smart Chain (BEP20)',
      validationProfile: 'EVM',
      isActive: true,
    });
    service = new DepositApprovalModeService(
      prisma as unknown as PrismaService,
    );
  });

  it('defaults a rail with no approval policy row to MANUAL', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        verificationMode: 'VERIFY_ONLY',
        chainId: 56,
        tokenContractAddress: '0x55d398326f99059ff775485246999027b3197955',
        tokenDecimals: 18,
        requiredConfirmations: 3,
      },
    ]);

    await expect(service.getRailApprovalMode(RAIL_ID)).resolves.toMatchObject({
      approvalPolicy: {
        approvalMode: 'MANUAL',
        automaticApprovalEnabled: false,
        revision: 0,
        automaticApprovalEligible: true,
      },
    });
  });

  it('rejects approval mode changes from a non-SUPER_ADMIN even with account-management permission', async () => {
    await expect(
      service.configureRailApprovalMode(
        RAIL_ID,
        { approvalMode: 'MANUAL', reason: 'Local QA' },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.depositPaymentRail.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when AUTO is requested without complete BSC VERIFY_ONLY configuration', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        verificationMode: 'OFF',
        chainId: null,
        tokenContractAddress: null,
        tokenDecimals: null,
        requiredConfirmations: null,
      },
    ]);

    await expect(
      service.configureRailApprovalMode(
        RAIL_ID,
        {
          approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
          reason: 'Enable automatic approval',
        },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
