import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { WalletLedgerService } from './wallet-ledger.service';
import {
  USER_WALLET_BUCKETS,
  depositClearingAccountKey,
  depositCreditSourceKey,
  userWalletAccountKey,
} from './wallet.constants';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const DEPOSIT_ID = '33333333-3333-4333-8333-333333333333';
const LEDGER_ID = '44444444-4444-4444-8444-444444444444';
const CURRENCY = 'USDT';

const actor: AuthenticatedUser = {
  id: ADMIN_ID,
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['ADMIN'],
  permissions: ['ledger.post'],
};

function approvedDeposit(status = 'APPROVED') {
  return {
    id: DEPOSIT_ID,
    userId: USER_ID,
    status,
    amount: new Prisma.Decimal('25.00000000'),
    currency: CURRENCY,
    txid: 'a'.repeat(64),
    assignedNetwork: 'TRC20',
    packageCode: 'NEURAL_SCOUT',
    packageDisplayName: 'Neural Scout',
    reviewedAt: new Date('2026-08-26T10:00:00.000Z'),
  };
}

function ledgerTransaction() {
  return {
    id: LEDGER_ID,
    kind: 'DEPOSIT_CREDIT' as const,
    sourceKey: depositCreditSourceKey(DEPOSIT_ID),
    sourceType: 'DEPOSIT',
    sourceId: DEPOSIT_ID,
    currency: CURRENCY,
    postedByUserId: ADMIN_ID,
    description: `Approved deposit ${DEPOSIT_ID} credited to Main / Deposit Balance.`,
    metadata: null,
    postedAt: new Date('2026-08-26T10:01:00.000Z'),
    createdAt: new Date('2026-08-26T10:01:00.000Z'),
  };
}

function ledgerAccount(
  accountKey: string,
  ownerType: 'SYSTEM' | 'USER',
  ownerUserId: string | null,
  bucket: (typeof USER_WALLET_BUCKETS)[number] | 'DEPOSIT_CLEARING',
  normalSide: 'DEBIT' | 'CREDIT',
) {
  return {
    id: `account-${accountKey}`,
    accountKey,
    ownerType,
    ownerUserId,
    bucket,
    currency: CURRENCY,
    normalSide,
  };
}

describe('WalletLedgerService', () => {
  const transaction = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(),
  };

  let service: WalletLedgerService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.$executeRaw.mockResolvedValue(1);
    transaction.auditLog.create.mockResolvedValue({});
    service = new WalletLedgerService(prisma as unknown as PrismaService);
  });

  it('rejects a deposit that is not approved before touching accounting tables', async () => {
    await expect(
      service.postApprovedDepositInTransaction(
        transaction as unknown as Prisma.TransactionClient,
        approvedDeposit('PENDING_REVIEW'),
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns the existing transaction without duplicating entries or balances', async () => {
    transaction.$queryRaw
      .mockResolvedValueOnce([ledgerTransaction()])
      .mockResolvedValueOnce([{ total: 2n }]);

    const result = await service.postApprovedDepositInTransaction(
      transaction as unknown as Prisma.TransactionClient,
      approvedDeposit(),
      actor,
    );

    expect(result.created).toBe(false);
    expect(result.message).toBe('Deposit accounting was already posted.');
    expect(result.transaction.id).toBe(LEDGER_ID);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('posts one balanced clearing debit and Main wallet credit with audit evidence', async () => {
    const userAccounts = USER_WALLET_BUCKETS.map((bucket) =>
      ledgerAccount(
        userWalletAccountKey(USER_ID, bucket, CURRENCY),
        'USER',
        USER_ID,
        bucket,
        'CREDIT',
      ),
    );
    const clearingAccount = ledgerAccount(
      depositClearingAccountKey(CURRENCY),
      'SYSTEM',
      null,
      'DEPOSIT_CLEARING',
      'DEBIT',
    );

    transaction.$queryRaw
      .mockResolvedValueOnce([ledgerTransaction()])
      .mockResolvedValueOnce([{ total: 0n }]);

    for (const account of userAccounts) {
      transaction.$queryRaw.mockResolvedValueOnce([account]);
    }

    transaction.$queryRaw
      .mockResolvedValueOnce([clearingAccount])
      .mockResolvedValueOnce([
        {
          id: 'entry-debit',
          transactionId: LEDGER_ID,
          accountId: clearingAccount.id,
          side: 'DEBIT',
          amount: new Prisma.Decimal('25.00000000'),
          memo: 'clearing',
          createdAt: new Date('2026-08-26T10:01:00.000Z'),
        },
        {
          id: 'entry-credit',
          transactionId: LEDGER_ID,
          accountId: userAccounts[0].id,
          side: 'CREDIT',
          amount: new Prisma.Decimal('25.00000000'),
          memo: 'main',
          createdAt: new Date('2026-08-26T10:01:00.001Z'),
        },
      ]);

    let auditData: Record<string, unknown> | null = null;
    transaction.auditLog.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        auditData = data;
        return Promise.resolve({});
      },
    );

    const result = await service.postApprovedDepositInTransaction(
      transaction as unknown as Prisma.TransactionClient,
      approvedDeposit(),
      actor,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.created).toBe(true);
    expect(result.message).toBe(
      'Approved deposit posted to Main / Deposit Balance.',
    );
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(15);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(8);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(auditData).toMatchObject({
      actorUserId: ADMIN_ID,
      action: 'CREATE',
      entityType: 'LedgerTransaction',
      entityId: LEDGER_ID,
      metadata: {
        source: 'WALLET_LEDGER',
        depositId: DEPOSIT_ID,
        userId: USER_ID,
        amount: '25.00000000',
        currency: CURRENCY,
        debitAccount: depositClearingAccountKey(CURRENCY),
        creditAccount: userWalletAccountKey(USER_ID, 'MAIN', CURRENCY),
        balanced: true,
        packageActivationApplied: false,
        referralCommissionApplied: false,
        rewardsApplied: false,
      },
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
  });
});
