import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { DepositBlockchainApprovalGuardService } from './deposit-blockchain-approval-guard.service';

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

  it.each(['PENDING', 'FAILED', 'UNAVAILABLE', null])(
    'blocks manual approval when VERIFY_ONLY is enabled and verification status is %s',
    async (verificationStatus) => {
      prisma.$queryRaw.mockResolvedValue([
        {
          depositId: DEPOSIT_ID,
          depositStatus: 'PENDING_REVIEW',
          approvalMode: 'MANUAL',
          verificationMode: 'VERIFY_ONLY',
          verificationStatus,
          failureCode:
            verificationStatus === 'FAILED' ? 'AMOUNT_MISMATCH' : null,
          failureReason: null,
        },
      ]);

      await expect(
        service.assertManualApprovalAllowed(DEPOSIT_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('allows manual approval when VERIFY_ONLY is enabled and verification is VERIFIED', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'PENDING_REVIEW',
        approvalMode: 'MANUAL',
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'VERIFIED',
        failureCode: null,
        failureReason: null,
      },
    ]);

    await expect(
      service.assertManualApprovalAllowed(DEPOSIT_ID),
    ).resolves.toMatchObject({
      approvalMode: 'MANUAL',
      allowed: true,
      verificationStatus: 'VERIFIED',
    });
  });

  it('treats missing approval config as MANUAL when blockchain verification is OFF', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'PENDING_REVIEW',
        approvalMode: null,
        verificationMode: 'OFF',
        verificationStatus: null,
        failureCode: null,
        failureReason: null,
      },
    ]);

    await expect(
      service.assertManualApprovalAllowed(DEPOSIT_ID),
    ).resolves.toMatchObject({
      approvalMode: 'MANUAL',
      allowed: true,
    });
  });

  it('blocks missing approval config when VERIFY_ONLY is enabled but verification failed', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'PENDING_REVIEW',
        approvalMode: null,
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'FAILED',
        failureCode: 'AMOUNT_MISMATCH',
        failureReason: null,
      },
    ]);

    await expect(
      service.assertManualApprovalAllowed(DEPOSIT_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks manual approval when AUTO_AFTER_BLOCKCHAIN_VERIFIED is configured', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'PENDING_REVIEW',
        approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'VERIFIED',
        failureCode: null,
        failureReason: null,
      },
    ]);

    await expect(
      service.assertManualApprovalAllowed(DEPOSIT_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows automatic approval only after blockchain verification is VERIFIED', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'PENDING_REVIEW',
        approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'VERIFIED',
        failureCode: null,
        failureReason: null,
      },
    ]);

    await expect(
      service.assertAutomaticApprovalAllowed(DEPOSIT_ID),
    ).resolves.toMatchObject({
      approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
      allowed: true,
      verificationStatus: 'VERIFIED',
    });
  });

  it.each(['PENDING', 'FAILED', 'UNAVAILABLE', null])(
    'blocks automatic approval when verification status is %s',
    async (verificationStatus) => {
      prisma.$queryRaw.mockResolvedValue([
        {
          depositId: DEPOSIT_ID,
          depositStatus: 'PENDING_REVIEW',
          approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
          verificationMode: 'VERIFY_ONLY',
          verificationStatus,
          failureCode:
            verificationStatus === 'FAILED' ? 'AMOUNT_MISMATCH' : null,
          failureReason: null,
        },
      ]);

      await expect(
        service.assertAutomaticApprovalAllowed(DEPOSIT_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('does not retroactively block an already approved historical deposit', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        depositId: DEPOSIT_ID,
        depositStatus: 'APPROVED',
        approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
        verificationMode: 'VERIFY_ONLY',
        verificationStatus: 'PENDING',
        failureCode: 'TX_NOT_FOUND_OR_PENDING',
        failureReason: null,
      },
    ]);

    await expect(
      service.assertAutomaticApprovalAllowed(DEPOSIT_ID),
    ).resolves.toMatchObject({
      allowed: true,
      historicalApproved: true,
    });
  });
});
