import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PermanentDepositFlowService } from './permanent-deposit-flow.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const DEFINITION_ID = '44444444-4444-4444-8444-444444444444';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const DEPOSIT_ID = '66666666-6666-4666-8666-666666666666';
const RAIL_ID = '77777777-7777-4777-8777-777777777777';
const ASSIGNMENT_ID = '88888888-8888-4888-8888-888888888888';
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
  createdAt: new Date('2026-09-09T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
};

const rail = {
  id: RAIL_ID,
  asset: 'USDT',
  networkCode: 'TRC20',
  displayName: 'USDT on TRON (TRC20)',
  validationProfile: 'TRON' as const,
  isActive: true,
  revision: 1,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date('2026-09-09T00:00:00.000Z'),
  updatedAt: new Date('2026-09-09T00:00:00.000Z'),
};

const account = {
  id: ACCOUNT_ID,
  label: 'Treasury A',
  paymentRailId: RAIL_ID,
  asset: 'USDT',
  network: 'TRC20',
  walletAddress: ADDRESS,
  qrCodeDataUrl: QR,
  isActive: true,
  revision: 1,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date('2026-09-09T00:00:00.000Z'),
  updatedAt: new Date('2026-09-09T00:00:00.000Z'),
};

const assignment = {
  id: ASSIGNMENT_ID,
  userId: USER_ID,
  paymentRailId: RAIL_ID,
  depositAccountId: ACCOUNT_ID,
  assignedAt: new Date('2026-09-09T00:00:00.000Z'),
};

function publishedPlan() {
  return [
    {
      id: PLAN_ID,
      activationTrigger: 'PAYMENT_APPROVED' as const,
      items: [
        {
          id: ITEM_ID,
          displayName: 'FTZ AlphaBot',
          availability: 'AVAILABLE' as const,
          price: new Prisma.Decimal('5.00000000'),
          minimumInvestment: new Prisma.Decimal('5.00000000'),
          maximumInvestment: new Prisma.Decimal('24.00000000'),
          durationDays: 10,
          principalTreatment: 'RETURN_SEPARATELY' as const,
          currency: 'USDT',
          packageDefinition: {
            id: DEFINITION_ID,
            code: 'FTZ_ALPHABOT',
          },
        },
      ],
    },
  ];
}

function pendingDeposit() {
  const now = new Date('2026-09-09T01:00:00.000Z');
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    openKey: USER_ID,
    status: 'PENDING_REVIEW' as const,
    packagePlanVersionId: PLAN_ID,
    packagePlanItemId: ITEM_ID,
    packageCode: 'FTZ_ALPHABOT',
    packageDisplayName: 'FTZ AlphaBot',
    amount: new Prisma.Decimal('5.00000000'),
    packageMinimumInvestment: new Prisma.Decimal('5.00000000'),
    packageMaximumInvestment: new Prisma.Decimal('24.00000000'),
    packageDurationDays: 10,
    packagePrincipalTreatment: 'RETURN_SEPARATELY',
    currency: 'USDT',
    assignedDepositAccountId: ACCOUNT_ID,
    assignedAccountLabel: 'Treasury A',
    assignedWalletAddress: ADDRESS,
    assignedNetwork: 'TRC20',
    assignedValidationProfile: 'TRON' as const,
    assignedQrCodeDataUrl: QR,
    txid: TXID,
    submittedAt: now,
    readyForApprovalByUserId: null,
    readyForApprovalAt: null,
    readyForApprovalNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
    user: {
      id: USER_ID,
      username: 'user',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    },
    readyForApprovalBy: null,
    reviewedBy: null,
  };
}

describe('PermanentDepositFlowService', () => {
  const transaction = {
    depositPaymentRail: {
      findFirst: jest.fn(),
    },
    depositAccount: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    deposit: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    packagePlanVersion: {
      findMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const prisma = {
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  } as unknown as PrismaService;

  let service: PermanentDepositFlowService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PermanentDepositFlowService(prisma);
  });

  it('reuses the existing permanent address for the same user and payment rail', async () => {
    transaction.depositPaymentRail.findFirst.mockResolvedValue(rail);
    transaction.$queryRaw.mockResolvedValue([assignment]);
    transaction.depositAccount.findFirst.mockResolvedValue(account);

    const result = await service.ensureAddressAssignment(RAIL_ID, actor);

    expect(result.assignment.walletAddress).toBe(ADDRESS);
    expect(result.assignment.paymentRailId).toBe(RAIL_ID);
    expect(result.assignment.permanent).toBe(true);
    expect(transaction.depositAccount.findMany).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('creates a PENDING_REVIEW deposit in one submission using the permanent address', async () => {
    transaction.deposit.findUnique.mockResolvedValue(null);
    transaction.packagePlanVersion.findMany.mockResolvedValue(publishedPlan());
    transaction.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignment]);
    transaction.depositPaymentRail.findFirst.mockResolvedValue(rail);
    transaction.depositAccount.findFirst.mockResolvedValue(account);
    transaction.deposit.create.mockResolvedValue(pendingDeposit());
    transaction.auditLog.create.mockResolvedValue({});

    const result = await service.submitDeposit(
      {
        packagePlanItemId: ITEM_ID,
        paymentRailId: RAIL_ID,
        investmentAmount: '5',
        txid: TXID,
      },
      actor,
    );

    expect(transaction.deposit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING_REVIEW',
          assignedDepositAccountId: ACCOUNT_ID,
          assignedWalletAddress: ADDRESS,
          assignedNetwork: 'TRC20',
          txid: TXID,
        }),
      }),
    );
    expect(result.deposit.status).toBe('PENDING_REVIEW');
    expect(result.deposit.assignedWalletAddress).toBe(ADDRESS);
  });
});
