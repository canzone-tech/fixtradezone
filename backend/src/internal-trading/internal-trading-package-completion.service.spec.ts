import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { InternalTradingPackageCompletionService } from './internal-trading-package-completion.service';

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RETURN_TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';
const PRINCIPAL_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const USER_MAIN_ACCOUNT_ID = '55555555-5555-4555-8555-555555555555';
const COMPLETED_AT = new Date('2026-09-13T10:00:00.000Z');

const actor: AuthenticatedUser = {
  id: '66666666-6666-4666-8666-666666666666',
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

interface AuditCreateArgs {
  data: Record<string, unknown>;
}

type AuditCreate = (args: AuditCreateArgs) => Promise<{ id: string }>;

function subscription(
  overrides: Partial<{
    packageDisplayName: string;
    price: Prisma.Decimal;
    principalTreatment: string;
    durationDays: number | null;
    status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
    completedAt: Date | null;
  }> = {},
) {
  return {
    id: SUBSCRIPTION_ID,
    userId: USER_ID,
    packageCode: 'NEURAL_SCOUT',
    packageDisplayName: 'FTZ AlphaBotc',
    price: new Prisma.Decimal('12.5'),
    currency: 'USDT',
    principalTreatment: 'RETURN_SEPARATELY',
    durationDays: 10,
    status: 'ACTIVE' as const,
    completedAt: null,
    ...overrides,
  };
}

function completedState(overrides: Record<string, unknown> = {}) {
  return {
    subscriptionId: SUBSCRIPTION_ID,
    status: 'COMPLETED' as const,
    completionReason: 'TARGET_REACHED_AT_DURATION_END' as const,
    principalAmount: new Prisma.Decimal('12.5'),
    completedAt: COMPLETED_AT,
    ...overrides,
  };
}

const principalAccount = {
  id: PRINCIPAL_ACCOUNT_ID,
  accountKey: 'SYSTEM:PACKAGE_PRINCIPAL:USDT',
  ownerType: 'SYSTEM' as const,
  ownerUserId: null,
  bucket: 'PACKAGE_PRINCIPAL',
  currency: 'USDT',
  normalSide: 'CREDIT' as const,
};

const userMainAccount = {
  id: USER_MAIN_ACCOUNT_ID,
  accountKey: `USER:${USER_ID}:MAIN:USDT`,
  ownerType: 'USER' as const,
  ownerUserId: USER_ID,
  bucket: 'MAIN',
  currency: 'USDT',
  normalSide: 'CREDIT' as const,
};

describe('InternalTradingPackageCompletionService', () => {
  const auditCreate: jest.MockedFunction<AuditCreate> = jest.fn();
  const transaction = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    auditLog: { create: auditCreate },
  };
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: InternalTradingPackageCompletionService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.$executeRaw.mockResolvedValue(1);
    auditCreate.mockResolvedValue({ id: 'audit-id' });
    prisma.$transaction.mockImplementation(
      async (work: (tx: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    );
    service = new InternalTradingPackageCompletionService(
      prisma as unknown as PrismaService,
    );
  });

  it('returns exact invested principal and completes a returnable package', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([subscription()])
      .mockResolvedValueOnce([completedState()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([principalAccount])
      .mockResolvedValueOnce([userMainAccount])
      .mockResolvedValueOnce([
        {
          side: 'DEBIT',
          amount: new Prisma.Decimal('12.5'),
          accountKey: principalAccount.accountKey,
        },
        {
          side: 'CREDIT',
          amount: new Prisma.Decimal('12.5'),
          accountKey: userMainAccount.accountKey,
        },
      ]);

    const result = await service.finalizeCompletion(SUBSCRIPTION_ID, actor, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(result).toMatchObject({
      finalized: true,
      principalReturnApplied: true,
    });
    expect(result.principalReturnTransactionId).toEqual(expect.any(String));
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(6);
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        action: 'CREATE',
        entityType: 'LedgerTransaction',
        metadata: {
          operation: 'RETURN_PACKAGE_PRINCIPAL',
          amount: '12.50000000',
          debitAccount: principalAccount.accountKey,
          creditAccount: userMainAccount.accountKey,
          balanced: true,
        },
      },
    });
    expect(auditCreate.mock.calls[1]?.[0]).toMatchObject({
      data: {
        action: 'UPDATE',
        entityType: 'UserPackageSubscription',
        metadata: {
          operation: 'FINALIZE_PACKAGE_COMPLETION',
          principalReturnApplied: true,
        },
      },
    });
  });

  it('completes PrimeBot without a principal-return ledger movement', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([
        subscription({
          packageDisplayName: 'FTZ PrimeBot',
          price: new Prisma.Decimal('5000'),
          principalTreatment: 'NON_REFUNDABLE_PACKAGE_VALUE',
          durationDays: 150,
        }),
      ])
      .mockResolvedValueOnce([
        completedState({ principalAmount: new Prisma.Decimal('5000') }),
      ]);

    const result = await service.finalizeCompletion(SUBSCRIPTION_ID, actor);

    expect(result).toEqual({
      finalized: true,
      principalReturnApplied: false,
      principalReturnTransactionId: null,
      message: 'Package completed. No capital return applies to this package.',
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0]?.[0]).toMatchObject({
      data: {
        metadata: {
          principalTreatment: 'NON_REFUNDABLE_PACKAGE_VALUE',
          principalReturnApplied: false,
        },
      },
    });
  });

  it('is idempotent after a verified principal-return transaction exists', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([
        subscription({ status: 'COMPLETED', completedAt: COMPLETED_AT }),
      ])
      .mockResolvedValueOnce([completedState()])
      .mockResolvedValueOnce([
        {
          id: RETURN_TRANSACTION_ID,
          kind: 'PACKAGE_PRINCIPAL_RETURN',
          sourceKey: `SUBSCRIPTION:${SUBSCRIPTION_ID}:PRINCIPAL_RETURN`,
          sourceType: 'PACKAGE_SUBSCRIPTION',
          sourceId: SUBSCRIPTION_ID,
          currency: 'USDT',
        },
      ])
      .mockResolvedValueOnce([
        {
          side: 'DEBIT',
          amount: new Prisma.Decimal('12.5'),
          accountKey: principalAccount.accountKey,
        },
        {
          side: 'CREDIT',
          amount: new Prisma.Decimal('12.5'),
          accountKey: userMainAccount.accountKey,
        },
      ]);

    await expect(
      service.finalizeCompletion(SUBSCRIPTION_ID, actor),
    ).resolves.toEqual({
      finalized: true,
      principalReturnApplied: false,
      principalReturnTransactionId: RETURN_TRANSACTION_ID,
      message: 'Package completion is already finalized.',
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('does nothing before internal trading reaches duration completion', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([subscription()])
      .mockResolvedValueOnce([
        completedState({
          status: 'ACTIVE',
          completionReason: null,
          completedAt: null,
        }),
      ]);

    await expect(
      service.finalizeCompletion(SUBSCRIPTION_ID, actor),
    ).resolves.toEqual({
      finalized: false,
      principalReturnApplied: false,
      principalReturnTransactionId: null,
      message: 'Package trading lifecycle is not complete yet.',
    });
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('lists completed trading states whose package subscription is still active', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { subscriptionId: SUBSCRIPTION_ID },
      { subscriptionId: '77777777-7777-4777-8777-777777777777' },
    ]);

    await expect(service.listPendingCompletions(25)).resolves.toEqual([
      SUBSCRIPTION_ID,
      '77777777-7777-4777-8777-777777777777',
    ]);
  });
});
