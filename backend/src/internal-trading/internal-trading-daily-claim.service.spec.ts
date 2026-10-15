import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { InternalTradingDailyClaimService } from './internal-trading-daily-claim.service';

const userId = '00000000-0000-4000-8000-000000000001';
const claimId = '00000000-0000-4000-8000-000000000002';

const baseClaim = {
  id: claimId, subscriptionId: '00000000-0000-4000-8000-000000000003',
  userId, localTradeDate: '2026-10-15', currency: 'USDT',
  dailyGrossRatePercent: '0.800000', dailyNetGrossAmount: '0.80000000',
  userSharePercent: '70.000000', adminSharePercent: '30.000000',
  userAmount: '0.56000000', adminAmount: '0.24000000',
  tradeCount: 5, status: 'CLAIMED' as const,
  ledgerTransactionId: '00000000-0000-4000-8000-000000000004',
  claimedAt: new Date('2026-10-15T15:00:00Z'),
  createdAt: new Date('2026-10-15T14:00:00Z'),
};

describe('V2 claim idempotency before wallet posting', () => {
  const actor = { id: userId } as AuthenticatedUser;

  function makeService(rows: unknown[]) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(rows),
      $executeRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(
        (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    return {
      tx,
      service: new InternalTradingDailyClaimService(prisma),
    };
  }

  it('returns an already claimed snapshot and never posts a second ledger', async () => {
    const { service, tx } = makeService([baseClaim]);
    const result = await service.claim(userId, claimId, actor);
    expect(result.alreadyClaimed).toBe(true);
    expect(result.claim.status).toBe('CLAIMED');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects an incomplete five-trade claim before any ledger write', async () => {
    const { service, tx } = makeService([
      {
        ...baseClaim, status: 'PENDING' as const, tradeCount: 4,
        ledgerTransactionId: null, claimedAt: null,
      },
    ]);
    await expect(service.claim(userId, claimId, actor)).rejects.toThrow(
      'Claim financial snapshot is invalid.',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
