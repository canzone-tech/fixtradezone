import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { InternalTradingV2TradeService } from './internal-trading-v2-trade.service';

const subscriptionId = '00000000-0000-4000-8000-000000000001';

function conflict(code: 'P2010' | 'P2034', originalCode?: string) {
  return new Prisma.PrismaClientKnownRequestError(
    'Transaction write conflict',
    {
      code,
      clientVersion: '7.9.1',
      meta: originalCode
        ? { driverAdapterError: { cause: { originalCode } } }
        : {},
    },
  );
}

describe('V2 reconciliation transaction conflict handling', () => {
  const finishedState = {
    subscriptionId,
    financialModelVersion: 'V2',
    status: 'COMPLETED',
  };

  function makeService() {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([finishedState]),
      $executeRaw: jest.fn(),
    };
    const transaction = jest.fn((work: (tx: typeof tx) => Promise<unknown>) =>
      work(tx),
    );
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    return {
      service: new InternalTradingV2TradeService(prisma),
      transaction,
      tx,
    };
  }

  it('retries a Prisma P2010 / MariaDB 1213 deadlock and preserves the completed state', async () => {
    const { service, transaction, tx } = makeService();
    transaction.mockRejectedValueOnce(conflict('P2010', '1213'));

    const result = await service.reconcileSubscription(subscriptionId, null);

    expect(result.state.status).toBe('COMPLETED');
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('retries a standard Prisma P2034 write conflict', async () => {
    const { service, transaction } = makeService();
    transaction.mockRejectedValueOnce(conflict('P2034'));

    await expect(
      service.reconcileSubscription(subscriptionId, null),
    ).resolves.toMatchObject({
      createdEvents: 0,
      createdSettlements: 0,
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated P2010 query failures', async () => {
    const { service, transaction } = makeService();
    const error = conflict('P2010', '1064');
    transaction.mockRejectedValueOnce(error);

    await expect(
      service.reconcileSubscription(subscriptionId, null),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('stops after three MariaDB deadlocks instead of retrying indefinitely', async () => {
    const { service, transaction } = makeService();
    transaction.mockRejectedValue(conflict('P2010', '1213'));

    await expect(
      service.reconcileSubscription(subscriptionId, null),
    ).rejects.toMatchObject({
      code: 'P2010',
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
