import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { DepositsService } from './deposits.service';
import { DirectDepositApprovalService } from './direct-deposit-approval.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SUPER_ADMIN_ID = '33333333-3333-4333-8333-333333333333';

const actor: AuthenticatedUser = {
  id: SUPER_ADMIN_ID,
  email: 'founder@example.com',
  username: 'founder',
  phone: null,
  firstName: 'Founder',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

function pendingDeposit() {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    status: 'PENDING_REVIEW',
    txid: 'a'.repeat(64),
    amount: new Prisma.Decimal('24'),
    currency: 'USDT',
    assignedDepositAccountId: '44444444-4444-4444-8444-444444444444',
    assignedWalletAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
    assignedNetwork: 'TRC20',
    assignedValidationProfile: 'TRON',
  };
}

describe('DirectDepositApprovalService', () => {
  const transaction = {
    deposit: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
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

  const depositsService = {
    getDeposit: jest.fn(),
  };

  let service: DirectDepositApprovalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DirectDepositApprovalService(
      prisma as unknown as PrismaService,
      depositsService as unknown as DepositsService,
    );
  });

  it('lets SUPER_ADMIN directly approve a pending deposit and records the bypass path', async () => {
    transaction.deposit.findUnique.mockResolvedValue(pendingDeposit());

    let updateArgs: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    } | null = null;
    transaction.deposit.updateMany.mockImplementation(
      (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        updateArgs = args;
        return Promise.resolve({ count: 1 });
      },
    );

    let auditArgs: { data: Record<string, unknown> } | null = null;
    transaction.auditLog.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        auditArgs = args;
        return Promise.resolve({ id: 'audit-id' });
      },
    );

    depositsService.getDeposit.mockResolvedValue({
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });

    const result = await service.approvePendingDeposit(
      DEPOSIT_ID,
      { note: 'Founder direct approval after TXID verification' },
      actor,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(updateArgs?.where).toEqual({
      id: DEPOSIT_ID,
      status: 'PENDING_REVIEW',
      openKey: USER_ID,
    });
    expect(updateArgs?.data).toMatchObject({
      status: 'APPROVED',
      openKey: null,
      reviewedByUserId: SUPER_ADMIN_ID,
      reviewNote: 'Founder direct approval after TXID verification',
    });
    expect(auditArgs?.data).toMatchObject({
      actorUserId: SUPER_ADMIN_ID,
      action: 'APPROVE',
      entityType: 'Deposit',
      entityId: DEPOSIT_ID,
      metadata: {
        approvalPath: 'SUPER_ADMIN_DIRECT',
        adminPreReviewApplied: false,
        readyForApprovalByUserId: null,
        readyForApprovalAt: null,
      },
    });
    expect(result).toMatchObject({
      approvalPath: 'SUPER_ADMIN_DIRECT',
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });
  });

  it('does not use the direct path for an ADMIN-reviewed ready deposit', async () => {
    transaction.deposit.findUnique.mockResolvedValue({
      ...pendingDeposit(),
      status: 'READY_FOR_APPROVAL',
    });

    await expect(
      service.approvePendingDeposit(
        DEPOSIT_ID,
        { note: 'not a direct path' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.deposit.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails closed when the deposit does not exist', async () => {
    transaction.deposit.findUnique.mockResolvedValue(null);

    await expect(
      service.approvePendingDeposit(
        DEPOSIT_ID,
        { note: 'missing deposit' },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
