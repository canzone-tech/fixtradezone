import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
};

const adminActor: AuthenticatedUser = {
  ...actor,
  id: '88888888-8888-4888-8888-888888888888',
  email: 'admin@example.com',
  username: 'admin',
  firstName: 'Admin',
  roles: ['ADMIN'],
  permissions: ['deposits.review'],
};

const superAdminActor: AuthenticatedUser = {
  ...actor,
  id: '99999999-9999-4999-8999-999999999999',
  email: 'founder@example.com',
  username: 'founder',
  firstName: 'Founder',
  roles: ['SUPER_ADMIN'],
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
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  updatedAt: new Date('2026-08-26T00:00:00.000Z'),
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
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  updatedAt: new Date('2026-08-26T00:00:00.000Z'),
  paymentRail: rail,
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
    packageDisplayName: 'FTZ AlphaBotc',
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
    txid: null,
    submittedAt: null,
    readyForApprovalByUserId: null,
    readyForApprovalAt: null,
    readyForApprovalNote: null,
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
    readyForApprovalBy: null,
    reviewedBy: null,
    ...overrides,
  };
}

function packagePlan(
  activationTrigger:
    | 'PAYMENT_APPROVED'
    | 'MANUAL_ACTIVATION'
    | 'RULE_BASED'
    | 'PAYMENT_SUBMITTED' = 'PAYMENT_APPROVED',
) {
  return [
    {
      id: PLAN_ID,
      activationTrigger,
      items: [
        {
          id: ITEM_ID,
          displayName: 'FTZ AlphaBotc',
          availability: 'AVAILABLE',
          price: new Prisma.Decimal('5.00000000'),
          minimumInvestment: new Prisma.Decimal('5.00000000'),
          maximumInvestment: new Prisma.Decimal('24.00000000'),
          durationDays: 10,
          principalTreatment: 'RETURN_SEPARATELY',
          currency: 'USDT',
          packageDefinition: {
            id: DEFINITION_ID,
            code: 'NEURAL_SCOUT',
          },
        },
      ],
    },
  ];
}

describe('DepositsService', () => {
  const transaction = {
    deposit: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    packagePlanVersion: {
      findMany: jest.fn(),
    },
    depositPaymentRail: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
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
    $queryRaw: jest.fn(),
  };

  const prisma = {
    deposit: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    depositPaymentRail: {
      findMany: jest.fn(),
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
    transaction.$queryRaw.mockResolvedValue([]);
  });

  it('rejects a second open deposit before package or rail assignment', async () => {
    transaction.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      status: 'PENDING_REVIEW',
    });

    await expect(
      service.createDeposit(
        { packagePlanItemId: ITEM_ID, paymentRailId: RAIL_ID },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.packagePlanVersion.findMany).not.toHaveBeenCalled();
  });

  it('rejects deposit funding when the configured activation engine is not live', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(
      packagePlan('RULE_BASED'),
    );

    await expect(
      service.createDeposit(
        { packagePlanItemId: ITEM_ID, paymentRailId: RAIL_ID },
        actor,
      ),
    ).rejects.toThrow(
      'Package activation trigger RULE_BASED is not available for deposit-funded activation yet.',
    );

    expect(transaction.depositPaymentRail.findFirst).not.toHaveBeenCalled();
    expect(transaction.depositAccount.findMany).not.toHaveBeenCalled();
    expect(transaction.deposit.create).not.toHaveBeenCalled();
  });

  it('requires an exact investment amount for a ranged package', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(packagePlan());

    await expect(
      service.createDeposit(
        { packagePlanItemId: ITEM_ID, paymentRailId: RAIL_ID },
        actor,
      ),
    ).rejects.toThrow('investmentAmount is required for this package range.');

    expect(transaction.depositPaymentRail.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a ranged investment below the package minimum', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(packagePlan());

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '4.99999999',
        },
        actor,
      ),
    ).rejects.toThrow('Investment amount must be at least 5.00000000 USDT.');
  });

  it('rejects a ranged investment above the package maximum', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(packagePlan());

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '24.00000001',
        },
        actor,
      ),
    ).rejects.toThrow('Investment amount must not exceed 24.00000000 USDT.');
  });

  it('allows deposit funding for authorized manual package activation', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(
      packagePlan('MANUAL_ACTIVATION'),
    );
    transaction.depositPaymentRail.findFirst.mockResolvedValue(rail);
    transaction.depositAccount.findMany.mockResolvedValue([account]);
    transaction.deposit.create.mockResolvedValue(deposit());
    transaction.auditLog.create.mockResolvedValue({});

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '5',
        },
        actor,
      ),
    ).resolves.toMatchObject({
      deposit: {
        id: DEPOSIT_ID,
        status: 'AWAITING_TXID',
      },
    });

    expect(transaction.depositPaymentRail.findFirst).toHaveBeenCalled();
    expect(transaction.deposit.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a payment rail that does not match the package currency', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(packagePlan());
    transaction.depositPaymentRail.findFirst.mockResolvedValue(null);

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '5',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an active account inside the selected payment rail', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(packagePlan());
    transaction.depositPaymentRail.findFirst.mockResolvedValue(rail);
    transaction.depositAccount.findMany.mockResolvedValue([]);

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '5',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('snapshots the exact user-selected ranged investment and rail/account', async () => {
    transaction.packagePlanVersion.findMany.mockResolvedValue(packagePlan());
    transaction.depositPaymentRail.findFirst.mockResolvedValue(rail);
    transaction.depositAccount.findMany.mockResolvedValue([account]);

    let createdData: Record<string, unknown> | null = null;
    transaction.deposit.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        createdData = data;
        return Promise.resolve(deposit(data));
      },
    );

    const result = await service.createDeposit(
      {
        packagePlanItemId: ITEM_ID,
        paymentRailId: RAIL_ID,
        investmentAmount: '12.5',
      },
      actor,
    );

    expect(createdData).toMatchObject({
      userId: USER_ID,
      openKey: USER_ID,
      packagePlanItemId: ITEM_ID,
      amount: new Prisma.Decimal('12.50000000'),
      packageMinimumInvestment: new Prisma.Decimal('5.00000000'),
      packageMaximumInvestment: new Prisma.Decimal('24.00000000'),
      packageDurationDays: 10,
      packagePrincipalTreatment: 'RETURN_SEPARATELY',
      assignedDepositAccountId: ACCOUNT_ID,
      assignedWalletAddress: ADDRESS,
      assignedNetwork: 'TRC20',
      assignedValidationProfile: 'TRON',
    });
    expect(result.deposit.amount).toBe('12.5');
    expect(result.deposit.packageMinimumInvestment).toBe('5');
    expect(result.deposit.packageMaximumInvestment).toBe('24');
    expect(result.deposit.packageDurationDays).toBe(10);
    expect(result.deposit.packagePrincipalTreatment).toBe('RETURN_SEPARATELY');
  });

  it('normalizes transaction IDs from the immutable validation profile snapshot', async () => {
    transaction.deposit.findFirst.mockResolvedValue(
      deposit({
        assignedNetwork: 'ETHEREUM',
        assignedValidationProfile: 'EVM',
      }),
    );

    let txUpdate: { data?: Record<string, unknown> } | null = null;
    transaction.deposit.updateMany.mockImplementation(
      (args: { data?: Record<string, unknown> }) => {
        txUpdate = args;
        return Promise.resolve({ count: 1 });
      },
    );
    transaction.deposit.findUniqueOrThrow.mockResolvedValue(
      deposit({
        assignedNetwork: 'ETHEREUM',
        assignedValidationProfile: 'EVM',
        txid: TXID,
        status: 'PENDING_REVIEW',
        submittedAt: new Date('2026-08-26T01:00:00.000Z'),
      }),
    );

    await service.submitTxid(
      DEPOSIT_ID,
      { txid: `0x${'A'.repeat(64)}` },
      actor,
    );

    expect(txUpdate?.data).toMatchObject({
      txid: TXID,
      status: 'PENDING_REVIEW',
    });
  });

  it('rejects a transaction identifier invalid for the snapshotted profile', async () => {
    transaction.deposit.findFirst.mockResolvedValue(deposit());

    await expect(
      service.submitTxid(DEPOSIT_ID, { txid: 'not-a-tron-txid' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets ADMIN mark only a pending deposit ready without releasing the open key', async () => {
    const pending = deposit({
      status: 'PENDING_REVIEW',
      txid: TXID,
      submittedAt: new Date('2026-08-26T01:00:00.000Z'),
    });
    transaction.deposit.findUnique.mockResolvedValue(pending);

    let updateArgs: { data: Record<string, unknown> } | null = null;
    transaction.deposit.updateMany.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        updateArgs = args;
        return Promise.resolve({ count: 1 });
      },
    );
    transaction.deposit.findUniqueOrThrow.mockResolvedValue(
      deposit({
        ...pending,
        status: 'READY_FOR_APPROVAL',
        readyForApprovalByUserId: adminActor.id,
        readyForApprovalAt: new Date('2026-08-26T02:00:00.000Z'),
        readyForApprovalNote: 'TXID checked on TRON explorer',
        readyForApprovalBy: {
          id: adminActor.id,
          username: adminActor.username,
          email: adminActor.email,
        },
      }),
    );

    await service.markReadyForApproval(
      DEPOSIT_ID,
      { note: 'TXID checked on TRON explorer' },
      adminActor,
    );

    expect(updateArgs?.data).toMatchObject({
      status: 'READY_FOR_APPROVAL',
      readyForApprovalByUserId: adminActor.id,
      readyForApprovalNote: 'TXID checked on TRON explorer',
    });
    expect(updateArgs?.data).not.toHaveProperty('openKey');
  });

  it('does not let SUPER_ADMIN self-create the maker review stage', async () => {
    await expect(
      service.markReadyForApproval(
        DEPOSIT_ID,
        { note: 'self review should fail' },
        superAdminActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let ADMIN perform final approval', async () => {
    await expect(
      service.approveDeposit(
        DEPOSIT_ID,
        { note: 'admin cannot approve' },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets SUPER_ADMIN approve only an ADMIN-reviewed ready deposit and releases the open key', async () => {
    const ready = deposit({
      status: 'READY_FOR_APPROVAL',
      txid: TXID,
      submittedAt: new Date('2026-08-26T01:00:00.000Z'),
      readyForApprovalByUserId: adminActor.id,
      readyForApprovalAt: new Date('2026-08-26T02:00:00.000Z'),
      readyForApprovalNote: 'TXID checked on TRON explorer',
      readyForApprovalBy: {
        id: adminActor.id,
        username: adminActor.username,
        email: adminActor.email,
      },
    });
    transaction.deposit.findUnique.mockResolvedValue(ready);

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

    transaction.deposit.findUniqueOrThrow.mockResolvedValue(
      deposit({
        ...ready,
        status: 'APPROVED',
        openKey: null,
        reviewedByUserId: superAdminActor.id,
        reviewedAt: new Date('2026-08-26T03:00:00.000Z'),
        reviewNote: 'Founder final approval',
      }),
    );

    let auditArgs: { data: Record<string, unknown> } | null = null;
    transaction.auditLog.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        auditArgs = args;
        return Promise.resolve({ id: 'audit-id' });
      },
    );

    await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'Founder final approval' },
      superAdminActor,
    );

    expect(updateArgs?.data).toMatchObject({
      status: 'APPROVED',
      openKey: null,
      reviewedByUserId: superAdminActor.id,
    });
    expect(auditArgs?.data).toMatchObject({
      action: 'APPROVE',
      metadata: {
        readyForApprovalByUserId: adminActor.id,
        downstreamAccountingApplied: false,
        packageActivationApplied: false,
      },
    });
  });

  it('rejects a final approval attempt while the deposit is still pending ADMIN review', async () => {
    transaction.deposit.findUnique.mockResolvedValue(
      deposit({
        status: 'PENDING_REVIEW',
        txid: TXID,
        submittedAt: new Date('2026-08-26T01:00:00.000Z'),
      }),
    );

    await expect(
      service.approveDeposit(
        DEPOSIT_ID,
        { note: 'too early' },
        superAdminActor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
