import { Prisma } from '../generated/prisma/client';
import {
  recordTradeResultNotification,
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
