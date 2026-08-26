import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { SubscriptionsService } from './subscriptions.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

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
  sourceDepositAccountingTransactionId:
    '55555555-5555-4555-8555-555555555555',
  fundingLedgerTransactionId: '66666666-6666-4666-8666-666666666666',
  packagePlanVersionId: '77777777-7777-4777-8777-777777777777',
  packagePlanItemId: '88888888-8888-4888-8888-888888888888',
  packageDefinitionId: '99999999-9999-4999-8999-999999999999',
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
    transaction.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      userId: USER_ID,
      status: 'APPROVED',
      amount: new Prisma.Decimal('5'),
      currency: 'USDT',
      packagePlanVersionId: '77777777-7777-4777-8777-777777777777',
      packagePlanItemId: '88888888-8888-4888-8888-888888888888',
      packageCode: 'NEURAL_SCOUT',
      packageDisplayName: 'Neural Scout',
      reviewedAt: new Date(),
    });

    await expect(
      service.activateFromApprovedDeposit(DEPOSIT_ID, actor),
    ).rejects.toThrow('Deposit accounting must be posted before package activation.');
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('blocks a second active package when the source plan is SINGLE_ACTIVE', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([{ id: USER_ID }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: '55555555-5555-4555-8555-555555555555',
          sourceKey: `DEPOSIT:${DEPOSIT_ID}:CREDIT`,
        },
      ])
      .mockResolvedValueOnce([{ total: 1 }]);
    transaction.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      userId: USER_ID,
      status: 'APPROVED',
      amount: new Prisma.Decimal('5'),
      currency: 'USDT',
      packagePlanVersionId: '77777777-7777-4777-8777-777777777777',
      packagePlanItemId: '88888888-8888-4888-8888-888888888888',
      packageCode: 'NEURAL_SCOUT',
      packageDisplayName: 'Neural Scout',
      reviewedAt: new Date(),
    });
    transaction.packagePlanItem.findUnique.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
      planVersionId: '77777777-7777-4777-8777-777777777777',
      packageDefinitionId: '99999999-9999-4999-8999-999999999999',
      price: new Prisma.Decimal('5'),
      currency: 'USDT',
      planVersion: {
        activationTrigger: 'PAYMENT_APPROVED',
        activePackageMode: 'SINGLE_ACTIVE',
      },
      packageDefinition: { id: '99999999-9999-4999-8999-999999999999' },
    });

    await expect(
      service.activateFromApprovedDeposit(DEPOSIT_ID, actor),
    ).rejects.toThrow('This plan allows only one active package for the USER.');
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });
});
