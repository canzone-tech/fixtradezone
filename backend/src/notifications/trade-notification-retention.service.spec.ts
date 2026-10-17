import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TradeNotificationRetentionService } from './trade-notification-retention.service';

const OLD_ID = '00000000-0000-4000-8000-000000000123';

describe('Five-day Internal Trading notification retention', () => {
  function mockService(ids: string[]) {
    const sql: Prisma.Sql[] = [];
    const execute = jest.fn(async (query: Prisma.Sql) => {
      sql.push(query);
      return ids.length;
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
      $executeRaw: execute,
    };
    const prisma = {
      $transaction: jest.fn(
        (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    } as unknown as PrismaService;
    const redis = {
      getClient: () => ({
        set: jest.fn().mockResolvedValue('OK'),
        eval: jest.fn().mockResolvedValue(1),
      }),
    } as unknown as RedisService;
    return {
      worker: new TradeNotificationRetentionService(prisma, redis),
      tx,
      sql,
    };
  }

  it('deletes dependent push deliveries first, then trade-related notifications', async () => {
    const { worker, tx, sql } = mockService([OLD_ID]);
    // The second sweep query returns no candidates.
    tx.$queryRaw.mockResolvedValueOnce([{ id: OLD_ID }]).mockResolvedValueOnce([]);
    const deleted = await worker.pruneExpired();

    expect(deleted).toBe(1);
    expect(sql).toHaveLength(2);
    expect(sql[0].strings.join(' ')).toContain(
      'DELETE FROM user_notification_push_deliveries',
    );
    expect(sql[1].strings.join(' ')).toContain('DELETE FROM user_notifications');
    expect(sql[1].strings.join(' ')).toContain('INTERNAL_TRADE_DAILY_CLAIMED');
    expect(sql[1].strings.join(' ')).not.toContain('internal_trade_events');
    expect(sql[1].values).toContain(5);
    expect(tx.$queryRaw.mock.calls[0][0].values).toContain(5);
  });

  it('keeps other categories and does not mutate anything with no expired IDs', async () => {
    const { worker, tx, sql } = mockService([]);
    expect(await worker.pruneExpired()).toBe(0);
    expect(sql).toHaveLength(0);
    expect(tx.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain(
      "WHERE sourceType IN",
    );
  });

  it('does not clean when another instance holds the Redis lock', async () => {
    const { worker, tx } = mockService([OLD_ID]);
    const redis = (worker as unknown as { redis: RedisService }).redis;
    const client = redis.getClient();
    jest.spyOn(redis, 'getClient').mockReturnValue({
      ...client,
      set: jest.fn().mockResolvedValue(null),
    } as never);

    expect(await worker.pruneExpired()).toBe(0);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
