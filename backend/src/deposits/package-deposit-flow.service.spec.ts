import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PackageDepositFlowService } from './package-deposit-flow.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const DEFINITION_ID = '44444444-4444-4444-8444-444444444444';
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const DEPOSIT_ID = '66666666-6666-4666-8666-666666666666';
const RAIL_ID = '77777777-7777-4777-8777-777777777777';
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
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
};

const route = {
  depositAccountId: ACCOUNT_ID,
  accountLabel: 'BullBot Treasury',
  paymentRailId: RAIL_ID,
  asset: 'USDT',
  network: 'TRC20',
  walletAddress: ADDRESS,
  qrCodeDataUrl: QR,
  accountIsActive: true,
  railDisplayName: 'USDT on TRON (TRC20)',
  validationProfile: 'TRON' as const,
  railIsActive: true,
};

function publishedPlan() {
  return [
    {
      id: PLAN_ID,
      versionNumber: 1,
      activationTrigger: 'PAYMENT_APPROVED' as const,
      items: [
        {
          id: ITEM_ID,
          displayName: 'FTZ BullBot',
          price: new Prisma.Decimal('25.00000000'),
          minimumInvestment: new Prisma.Decimal('25.00000000'),
          maximumInvestment: new Prisma.Decimal('49.00000000'),
          durationDays: 15,
          principalTreatment: 'RETURN_SEPARATELY',
          currency: 'USDT',
          packageDefinition: {
            id: DEFINITION_ID,
            code: 'FTZ_BULLBOT',
          },
        },
      ],
    },
  ];
}

function pendingDeposit() {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    status: 'PENDING_REVIEW' as const,
    packagePlanVersionId: PLAN_ID,
    packagePlanItemId: ITEM_ID,
    packageCode: 'FTZ_BULLBOT',
    packageDisplayName: 'FTZ BullBot',
    amount: new Prisma.Decimal('25.00000000'),
    packageMinimumInvestment: new Prisma.Decimal('25.00000000'),
    packageMaximumInvestment: new Prisma.Decimal('49.00000000'),
    packageDurationDays: 15,
    packagePrincipalTreatment: 'RETURN_SEPARATELY',
    currency: 'USDT',
    assignedDepositAccountId: ACCOUNT_ID,
    assignedAccountLabel: 'BullBot Treasury',
    assignedWalletAddress: ADDRESS,
    assignedNetwork: 'TRC20',
    assignedValidationProfile: 'TRON' as const,
    assignedQrCodeDataUrl: QR,
    txid: TXID,
    submittedAt: new Date('2026-09-09T12:00:00.000Z'),
    readyForApprovalByUserId: null,
    readyForApprovalAt: null,
    readyForApprovalNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date('2026-09-09T12:00:00.000Z'),
    updatedAt: new Date('2026-09-09T12:00:00.000Z'),
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

describe('PackageDepositFlowService', () => {
  const transaction = {
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
  };

  const prismaMock = {
    packagePlanVersion: {
      findMany: jest.fn(),
    },
    deposit: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(
      (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  const prisma = prismaMock as unknown as PrismaService;
  let service: PackageDepositFlowService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PackageDepositFlowService(prisma);
  });

  it('returns the package-configured receiving account without per-user assignment', async () => {
    prismaMock.packagePlanVersion.findMany.mockResolvedValue(publishedPlan());
    prismaMock.$queryRaw.mockResolvedValue([route]);
    prismaMock.deposit.findUnique.mockResolvedValue(null);

    const result = await service.getPackageDepositContext(ITEM_ID, actor);

    expect(result.package.id).toBe(ITEM_ID);
    expect(result.receivingAccount.id).toBe(ACCOUNT_ID);
    expect(result.receivingAccount.walletAddress).toBe(ADDRESS);
    expect(result.receivingAccount.network).toBe('TRC20');
  });

  it('creates PENDING_REVIEW directly using the package-configured account', async () => {
    transaction.deposit.findUnique.mockResolvedValue(null);
    transaction.packagePlanVersion.findMany.mockResolvedValue(publishedPlan());
    transaction.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([route]);
    transaction.deposit.create.mockImplementation((args: unknown) => {
      const data = (
        args as {
          data: {
            status: string;
            assignedDepositAccountId: string;
            assignedWalletAddress: string;
            assignedNetwork: string;
            txid: string | null;
          };
        }
      ).data;

      expect(data.status).toBe('PENDING_REVIEW');
      expect(data.assignedDepositAccountId).toBe(ACCOUNT_ID);
      expect(data.assignedWalletAddress).toBe(ADDRESS);
      expect(data.assignedNetwork).toBe('TRC20');
      expect(data.txid).toBe(TXID);
      return Promise.resolve(pendingDeposit());
    });
    transaction.auditLog.create.mockResolvedValue({});

    const result = await service.submitDeposit(
      {
        packagePlanItemId: ITEM_ID,
        investmentAmount: '25',
        txid: TXID,
      },
      actor,
    );

    expect(transaction.deposit.create).toHaveBeenCalledTimes(1);
    expect(result.deposit.status).toBe('PENDING_REVIEW');
    expect(result.deposit.assignedDepositAccountId).toBe(ACCOUNT_ID);
  });
});
