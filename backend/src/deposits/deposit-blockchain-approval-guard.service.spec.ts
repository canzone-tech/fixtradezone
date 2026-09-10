import { ConflictException } from '@nestjs/common';
import { DepositBlockchainApprovalGuardService } from './deposit-blockchain-approval-guard.service';
import type { PrismaService } from '../database/prisma.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';

describe('DepositBlockchainApprovalGuardService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  let service: DepositBlockchainApprovalGuardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DepositBlockchainApprovalGuardService(
      prisma as unknown as PrismaService,
    );
  });

  it('allows approval when blockchain verification is not required', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'PENDING_REVIEW',
        verificationMode: 'OFF',
        verificationStatus: null,
        failureCode: null,
        failureReason: null,
      },
    ]);

    await expect(service.assertApprovalAllowed(DEPOSIT_ID)).resolves.toMatchObject({
      required: false,
      allowed: true,
    });
  });

  it('allows approval only after required blockchain verification is VERIFIED', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'READY_FOR_APPROVAL',
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'VERIFIED',
        failureCode: null,
        failureReason: null,
      },
    ]);

    await expect(service.assertApprovalAllowed(DEPOSIT_ID)).resolves.toMatchObject({
      required: true,
      allowed: true,
      verificationStatus: 'VERIFIED',
    });
  });

  it.each(['PENDING', 'FAILED', 'UNAVAILABLE', null])(
    'blocks approval when required verification status is %s',
    async (verificationStatus) => {
      prisma.$queryRaw.mockResolvedValue([
        {
          depositId: DEPOSIT_ID,
          depositStatus: 'PENDING_REVIEW',
          verificationMode: 'VERIFY_ONLY',
          verificationStatus,
          failureCode:
            verificationStatus === 'FAILED' ? 'AMOUNT_MISMATCH' : null,
          failureReason: null,
        },
      ]);

      await expect(
        service.assertApprovalAllowed(DEPOSIT_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('does not retroactively block an already approved historical deposit', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'APPROVED',
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'PENDING',
        failureCode: 'TX_NOT_FOUND_OR_PENDING',
        failureReason: null,
      },
    ]);

    await expect(service.assertApprovalAllowed(DEPOSIT_ID)).resolves.toMatchObject({
      required: true,
      allowed: true,
      historicalApproved: true,
    });
  });
});
