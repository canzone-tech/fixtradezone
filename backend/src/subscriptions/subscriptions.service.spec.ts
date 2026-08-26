import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { SubscriptionsService } from './subscriptions.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_VERSION_ID = '77777777-7777-4777-8777-777777777777';
const PLAN_ITEM_ID = '88888888-8888-4888-8888-888888888888';
const DEFINITION_ID = '99999999-9999-4999-8999-999999999999';
const ACCOUNTING_TRANSACTION_ID = '55555555-5555-4555-8555-555555555555';
const FUNDING_TRANSACTION_ID = '66666666-6666-4666-8666-666666666666';

// Keep the audit assertion explicitly typed so strict lint guards the money path.
interface AuditCreateCall {
  data: {
    action: string;
    entityType: string;
    metadata: {
      balanced: boolean;
      depositId: string;
      amount: string;
      currency: string;
      referralCommissionApplied: boolean;
      rewardsApplied: boolean;
    };
  };
}

const actor: AuthenticatedUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

const existingSubscription = {
  id: '44444444-4444-4444-8444-444444444444',
  userId: USER_ID,
  sourceDepositId: DEPOSIT_ID,
  sourceDepositAccountingTransactionId: ACCOUNTING_TRANSACTION_ID,
  fundingLedgerTransactionId: FUNDING_TRANSACTION_ID,
  packagePlanVersionId: PLAN_VERSION_ID,
  packagePlanItemId: PLAN_ITEM_ID,
  packageDefinitionId: DEFINITION_ID,
  packageCode: 'NEURAL_SCOUT',
  packageDisplayName: 'Neural Scout',
  price: new Prisma.Decimal('5'),
  currency: 'USDT',
  activePackageMode: 'SINGLE_ACTIVE',
  multipleActivePackageBasis: 'HIGHEST_ACTIVE_PACKAGE',
  activationTrigger: 'PAYMENT_APPROVED',
  renewalMode: 'MANUAL_AFTER_TERMINAL',
  upgradesEnabled: false,
  settlementTimezone: 'UTC',
  rewardRateMode: 'RANDOM_RANGE',
  fixedRewardRate: null,
  minimumRewardRate: new Prisma.Decimal('0.004'),
  maximumRewardRate: new Prisma.Decimal('0.006'),
  rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
  capBasis: 'TOTAL_RETURN',
  capMultiplier: new Prisma.Decimal('2'),
  principalTreatment: 'INCLUDED_IN_TOTAL_RETURN',
  goalDays: 90,
  cycleDays: 10,
  rewardStartMode: 'NEXT_CALENDAR_DAY',
  rewardFrequency: 'DAILY_CALENDAR',
  cycleDayMode: 'CALENDAR_DAYS',
  rewardDayMode: 'EVERY_DAY',
  cycleEndAction: 'COMPLETE_PACKAGE',
  capReachedAction: 'COMPLETE_PACKAGE',
  status: 'ACTIVE' as const,
  activatedAt: new Date('2026-08-26T01:00:00.000Z'),
  scheduledEndAt: new Date('2026-11-24T01:00:00.000Z'),
  completedAt: null,
  createdAt: new Date('2026-08-26T01:00:00.000Z'),
  updatedAt: new Date('2026-08-26T01:00:00.000Z'),
};

const approvedDeposit = {
  id: DEPOSIT_ID,
  userId: USER_ID,
  status: 'APPROVED',
  amount: new Prisma.Decimal('5'),
  currency: 'USDT',
  packagePlanVersionId: PLAN_VERSION_ID,
  packagePlanItemId: PLAN_ITEM_ID,
  packageCode: 'NEURAL_SCOUT',
  packageDisplayName: 'Neural Scout',
  reviewedAt: new Date('2026-08-26T00:30:00.000Z'),
};

const planItem = {
  id: PLAN_ITEM_ID,
  planVersionId: PLAN_VERSION_ID,
  packageDefinitionId: DEFINITION_ID,
  price: new Prisma.Decimal('5'),
  currency: 'USDT',
  rewardRateMode: 'RANDOM_RANGE',
  fixedRewardRate: null,
  minimumRewardRate: new Prisma.Decimal('0.004'),
  maximumRewardRate: new Prisma.Decimal('0.006'),
  rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
  capBasis: 'TOTAL_RETURN',
  capMultiplier: new Prisma.Decimal('2'),
  principalTreatment: 'INCLUDED_IN_TOTAL_RETURN',
  goalDays: 90,
  cycleDays: 10,
  rewardStartMode: 'NEXT_CALENDAR_DAY',
  rewardFrequency: 'DAILY_CALENDAR',
  cycleDayMode: 'CALENDAR_DAYS',
  rewardDayMode: 'EVERY_DAY',
  cycleEndAction: 'COMPLETE_PACKAGE',
  capReachedAction: 'COMPLETE_PACKAGE',
  planVersion: {
    activationTrigger: 'PAYMENT_APPROVED',
    activePackageMode: 'SINGLE_ACTIVE',
    multipleActivePackageBasis: 'HIGHEST_ACTIVE_PACKAGE',
    renewalMode: 'MANUAL_AFTER_TERMINAL',
    upgradesEnabled: false,
    settlementTimezone: 'UTC',
  },
  packageDefinition: { id: DEFINITION_ID },
};

describe('SubscriptionsService', () => {
  const transaction = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    deposit: { findUnique: jest.fn() },
    packagePlanItem: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
  };

  let service: SubscriptionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.$executeRaw.mockResolvedValue(1);
    prisma.$transaction.mockImplementation(
      async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    );
    service = new SubscriptionsService(prisma as unknown as PrismaService);
  });

  it('returns the existing subscription without consuming principal again', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValueOnce([existingSubscription]);

    const result = await service.activateFromApprovedDeposit(DEPOSIT_ID, actor);

    expect(result).toMatchObject({
      created: false,
      subscription: {
        id: existingSubscription.id,
        sourceDepositId: DEPOSIT_ID,
        price: '5.00000000',
      },
    });
    expect(transaction.deposit.findUnique).not.toHaveBeenCalled();
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects activation until the approved deposit has a WAL accounting credit', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    transaction.deposit.findUnique.mockResolvedValue(approvedDeposit);

    await expect(
      service.activateFromApprovedDeposit(DEPOSIT_ID, actor),
    ).rejects.toThrow(
      'Deposit accounting must be posted before package activation.',
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('blocks a second active package when the source plan is SINGLE_ACTIVE', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: ACCOUNTING_TRANSACTION_ID,
          sourceKey: `DEPOSIT:${DEPOSIT_ID}:CREDIT`,
        },
      ])
      .mockResolvedValueOnce([{ id: existingSubscription.id }]);
    transaction.deposit.findUnique.mockResolvedValue(approvedDeposit);
    transaction.packagePlanItem.findUnique.mockResolvedValue(planItem);

    await expect(
      service.activateFromApprovedDeposit(DEPOSIT_ID, actor),
    ).rejects.toThrow('This plan allows only one active package for the USER.');
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('creates one balanced funding transaction and subscription for an eligible deposit', async () => {
    const mainAccount = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accountKey: `USER:${USER_ID}:MAIN:USDT`,
      ownerType: 'USER',
      ownerUserId: USER_ID,
      bucket: 'MAIN',
      currency: 'USDT',
      normalSide: 'CREDIT',
    };
    const principalAccount = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      accountKey: 'SYSTEM:PACKAGE_PRINCIPAL:USDT',
      ownerType: 'SYSTEM',
      ownerUserId: null,
      bucket: 'PACKAGE_PRINCIPAL',
      currency: 'USDT',
      normalSide: 'CREDIT',
    };
    let auditCall: AuditCreateCall | null = null;

    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: ACCOUNTING_TRANSACTION_ID,
          sourceKey: `DEPOSIT:${DEPOSIT_ID}:CREDIT`,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: FUNDING_TRANSACTION_ID,
          sourceKey: `DEPOSIT:${DEPOSIT_ID}:PACKAGE_ACTIVATION`,
        },
      ])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([mainAccount])
      .mockResolvedValueOnce([principalAccount])
      .mockResolvedValueOnce([
        { side: 'DEBIT', amount: new Prisma.Decimal('5') },
        { side: 'CREDIT', amount: new Prisma.Decimal('5') },
      ])
      .mockResolvedValueOnce([existingSubscription]);
    transaction.deposit.findUnique.mockResolvedValue(approvedDeposit);
    transaction.packagePlanItem.findUnique.mockResolvedValue(planItem);
    transaction.auditLog.create.mockImplementation((input: AuditCreateCall) => {
      auditCall = input;
      return Promise.resolve({ id: 'audit-id' });
    });

    const result = await service.activateFromApprovedDeposit(DEPOSIT_ID, actor, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result).toMatchObject({
      created: true,
      subscription: {
        sourceDepositId: DEPOSIT_ID,
        packageCode: 'NEURAL_SCOUT',
        price: '5.00000000',
        currency: 'USDT',
        status: 'ACTIVE',
      },
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(8);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);

    if (!auditCall) {
      throw new Error('Expected package activation audit call.');
    }
    expect(auditCall.data.action).toBe('ACTIVATE');
    expect(auditCall.data.entityType).toBe('UserPackageSubscription');
    expect(auditCall.data.metadata.balanced).toBe(true);
    expect(auditCall.data.metadata.depositId).toBe(DEPOSIT_ID);
    expect(auditCall.data.metadata.amount).toBe('5.00000000');
    expect(auditCall.data.metadata.currency).toBe('USDT');
    expect(auditCall.data.metadata.referralCommissionApplied).toBe(false);
    expect(auditCall.data.metadata.rewardsApplied).toBe(false);
  });
});
