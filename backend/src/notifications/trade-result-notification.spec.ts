import { Prisma } from '../generated/prisma/client';
import {
  recordTradeResultNotification,
  recordClaimProfitReadyNotification,
  recordClaimProfitCompletedNotification,
  type TradeResultNotificationInput,
} from './trade-result-notification';

describe('Daily Trade WIN/LOSS inbox notification', () => {
  const base: TradeResultNotificationInput = {
    userId: '00000000-0000-4000-8000-000000000001',
    eventId: '00000000-0000-4000-8000-000000000002',
    assetSymbol: 'BTC/USDT',
    outcome: 'WIN',
    slotNumber: 1,
  };

  function mockTransaction() {
    const execute = jest
      .fn<Promise<number>, [Prisma.Sql]>()
      .mockResolvedValue(1);
    const tx = { $executeRaw: execute } as unknown as Prisma.TransactionClient;
    return { tx, execute };
  }

  it('writes one FINANCE WIN alert linked to the canonical event', async () => {
    const { tx, execute } = mockTransaction();
    await recordTradeResultNotification(tx, base);

    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('INSERT INTO user_notifications');
    expect(query.values).toEqual(
      expect.arrayContaining([
        base.userId,
        'Daily Trade WIN — BTC/USDT',
        base.eventId,
      ]),
    );
    expect(query.values).toContain(
      'Your algorithm-generated BTC/USDT Daily Trade #1 completed with a positive result. View Daily Trade History.',
    );
  });

  it('describes LOSS without implying any wallet deduction', async () => {
    const { tx, execute } = mockTransaction();
    await recordTradeResultNotification(tx, {
      ...base,
      eventId: '00000000-0000-4000-8000-000000000003',
      outcome: 'LOSS',
      slotNumber: 5,
      assetSymbol: 'ETH/USDT',
    });

    const query = execute.mock.calls[0][0];
    expect(query.values).toContain('Daily Trade LOSS — ETH/USDT');
    expect(query.values).toContain(
      'Your algorithm-generated ETH/USDT Daily Trade #5 completed with a negative result. View Daily Trade History.',
    );
    expect(query.strings.join(' ')).not.toContain('ledger_');
  });

  it('does not swallow a failed transaction write', async () => {
    const fail = new Error('Transaction rolled back');
    const tx = {
      $executeRaw: jest.fn().mockRejectedValue(fail),
    } as unknown as Prisma.TransactionClient;

    await expect(recordTradeResultNotification(tx, base)).rejects.toBe(fail);
  });
});

describe('V2 Claim Profit inbox notification', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const claimId = '00000000-0000-4000-8000-000000000007';

  it('only emits a ready notification when the newly inserted PENDING claim ID exists', async () => {
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $executeRaw: execute } as unknown as Prisma.TransactionClient;

    await recordClaimProfitReadyNotification(tx, {
      userId,
      claimId,
      localTradeDate: '2026-10-18',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0][0] as Prisma.Sql;
    expect(query.strings.join(' ')).toContain('FROM internal_trade_daily_claims c');
    expect(query.strings.join(' ')).toContain("c.status = 'PENDING'");
    expect(query.values).toEqual(
      expect.arrayContaining([claimId, userId, 'Claim Profit Ready — Daily Trade']),
    );
    expect(query.values).toContain(
      'Your V2 algorithm-generated Daily Trades for 2026-10-18 are complete (5/5). Claim Profit is now available on the Trading page.',
    );
  });

  it('emits a success notification for the claimed amount only after a CLAIMED row exists', async () => {
    const execute = jest.fn().mockResolvedValue(1);
    const tx = { $executeRaw: execute } as unknown as Prisma.TransactionClient;

    await recordClaimProfitCompletedNotification(tx, {
      userId,
      claimId,
      localTradeDate: '2026-10-18',
      userAmount: '0.70175868',
      currency: 'USDT',
    });
    const query = execute.mock.calls[0][0] as Prisma.Sql;
    expect(query.strings.join(' ')).toContain("c.status = 'CLAIMED'");
    expect(query.values).toEqual(
      expect.arrayContaining([claimId, userId, 'Claim Profit Successful — Daily Trade']),
    );
    expect(query.values).toContain(
      'Your V2 Daily Trade profit for 2026-10-18 was claimed successfully. 0.70175868 USDT was credited to Package Earnings. View Trading History.',
    );
  });

  it('propagates claim notification SQL failure to the enclosing transaction', async () => {
    const error = new Error('Claim notification failed');
    const tx = {
      $executeRaw: jest.fn().mockRejectedValue(error),
    } as unknown as Prisma.TransactionClient;

    await expect(
      recordClaimProfitReadyNotification(tx, { userId, claimId, localTradeDate: '2026-10-18' }),
    ).rejects.toBe(error);
  });
});
