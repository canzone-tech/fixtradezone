import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { DepositsService } from './deposits.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const DEFINITION_ID = '44444444-4444-4444-8444-444444444444';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const DEPOSIT_ID = '66666666-6666-4666-8666-666666666666';
const ADDRESS = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
const QR = 'data:image/png;base64,aGVsbG8=';
const TXID = 'a'.repeat(64);

const actor: AuthenticatedUser = {
  id: USER_ID,
  email: 'user@example.com',
  username: 'user',
  phone: null,
  firstName: 'Test',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
};

function deposit(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    openKey: USER_ID,
    status: 'AWAITING_TXID' as const,
    packagePlanVersionId: PLAN_ID,
    packagePlanItemId: ITEM_ID,
    packageCode: 'NEURAL_SCOUT',
    packageDisplayName: 'Neural Scout',
    amount: new Prisma.Decimal('5.00000000'),
    currency: 'USDT',
    assignedDepositAccountId: ACCOUNT_ID,
    assignedAccountLabel: 'Treasury A',
    assignedWalletAddress: ADDRESS,
    assignedNetwork: 'TRC20',
    assignedQrCodeDataUrl: QR,
    txid: null,
    submittedAt: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
    user: {
      id: USER_ID,
      username: 'user',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    },
    reviewedBy: null,
    ...overrides,
  };
}

describe('DepositsService', () => {
  const transaction = {
    deposit: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    packagePlanVersion: {
      findMany: jest.fn(),
    },
    depositAccount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    deposit: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    depositAccount: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: DepositsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DepositsService(prisma as unknown as PrismaService);
    transaction.deposit.findUnique.mockResolvedValue(null);
  });

  it('rejects a second open deposit before assigning a receiving account', async () => {
    transaction.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      status: 'PENDING_REVIEW',
    });

    await expect(
      service.createDeposit({ packagePlanItemId: ITEM_ID }, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.packagePlanVersion.findMany).not.toHaveBeenCalled();
  });

  it('requires an active USDT TRC20 receiving account', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue([
      {
        id: PLAN_ID,
        items: [
          {
            id: ITEM_ID,
            displayName: 'Neural Scout',
            availability: 'AVAILABLE',
            price: new Prisma.Decimal('5.00000000'),
            currency: 'USDT',
            packageDefinition: {
              id: DEFINITION_ID,
              code: 'NEURAL_SCOUT',
            },
          },
        ],
      },
    ]);
    transaction.depositAccount.findMany.mockResolvedValue([]);

    await expect(
      service.createDeposit({ packagePlanItemId: ITEM_ID }, actor),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uses the published package amount and server-assigned account snapshot', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue([
      {
        id: PLAN_ID,
        items: [
          {
            id: ITEM_ID,
            displayName: 'Neural Scout',
            availability: 'AVAILABLE',
            price: new Prisma.Decimal('5.00000000'),
            currency: 'USDT',
            packageDefinition: {
              id: DEFINITION_ID,
              code: 'NEURAL_SCOUT',
            },
          },
        ],
      },
    ]);
    transaction.depositAccount.findMany.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        label: 'Treasury A',
        asset: 'USDT',
        network: 'TRC20',
        walletAddress: ADDRESS,
        qrCodeDataUrl: QR,
        isActive: true,
        revision: 1,
        createdByUserId: null,
        updatedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    transaction.deposit.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(deposit(data)),
    );

    const result = await service.createDeposit(
      { packagePlanItemId: ITEM_ID },
      actor,
    );

    expect(transaction.deposit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          openKey: USER_ID,
          packagePlanItemId: ITEM_ID,
          amount: new Prisma.Decimal('5.00000000'),
          assignedDepositAccountId: ACCOUNT_ID,
          assignedWalletAddress: ADDRESS,
          assignedNetwork: 'TRC20',
        }),
      }),
    );
    expect(result.deposit.amount).toBe('5');
    expect(result.deposit.assignedWalletAddress).toBe(ADDRESS);
  });

  it('submits TXID only from AWAITING_TXID', async () => {
    transaction.deposit.findFirst.mockResolvedValue(
      deposit({ status: 'PENDING_REVIEW', txid: TXID }),
    );

    await expect(
      service.submitTxid(DEPOSIT_ID, { txid: TXID }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves only PENDING_REVIEW and releases the DB open-deposit key', async () => {
    const pending = deposit({
      status: 'PENDING_REVIEW',
      txid: TXID,
      submittedAt: new Date('2026-08-26T01:00:00.000Z'),
    });
    transaction.deposit.findUnique.mockResolvedValue(pending);
    transaction.deposit.updateMany.mockResolvedValue({ count: 1 });
    transaction.deposit.findUniqueOrThrow.mockResolvedValue(
      deposit({
        status: 'APPROVED',
        openKey: null,
        txid: TXID,
        submittedAt: pending.submittedAt,
        reviewedByUserId: USER_ID,
        reviewedAt: new Date('2026-08-26T02:00:00.000Z'),
        reviewNote: 'TXID manually verified',
      }),
    );

    await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'TXID manually verified' },
      actor,
    );

    expect(transaction.deposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: DEPOSIT_ID,
          status: 'PENDING_REVIEW',
          openKey: USER_ID,
        }),
        data: expect.objectContaining({
          status: 'APPROVED',
          openKey: null,
          reviewedByUserId: USER_ID,
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'APPROVE',
          metadata: expect.objectContaining({
            downstreamAccountingApplied: false,
            packageActivationApplied: false,
          }),
        }),
      }),
    );
  });
});
