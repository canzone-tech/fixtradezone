import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

const RETENTION_DAYS = 5;
const BATCH_SIZE = 500;
const MAX_BATCHES = 20;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const LOCK_TTL_MS = 5 * 60 * 1000;
const LOCK_KEY = 'ftz:notifications:trade-retention:v1:lock';

interface NotificationIdRow {
  id: string;
}

/**
 * Only ephemeral Internal Trading notifications expire after five days.
 *
 * Source of truth is kept intact: internal_trade_events,
 * internal_trade_daily_claims, wallet ledger and audit_log are NEVER modified.
 * Delivery rows are removed before their parent notifications in the SAME
 * transaction (both tables have restrictive foreign keys).
 */
@Injectable()
export class TradeNotificationRetentionService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TradeNotificationRetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.pruneExpired();
    }, SWEEP_INTERVAL_MS);
    this.timer.unref();

    // Don't wait ten minutes after a deployment before the first cleanup.
    void this.pruneExpired();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pruneExpired(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    const token = randomUUID();
    let acquired = false;
    let totalDeleted = 0;

    try {
      const redis = this.redis.getClient();
      acquired =
        (await redis.set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
      if (!acquired) return 0;

      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const deleted = await this.pruneOneBatch();
        totalDeleted += deleted;
        if (deleted < BATCH_SIZE) break;
      }

      if (totalDeleted > 0) {
        this.logger.log(
          `Expired ${totalDeleted} Internal Trading inbox notification(s) older than ${RETENTION_DAYS} days.`,
        );
      }
      return totalDeleted;
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? `Notification retention worker failed: ${error.message}`
          : 'Notification retention worker failed.',
      );
      return totalDeleted;
    } finally {
      if (acquired) {
        try {
          await this.redis.getClient().eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            LOCK_KEY,
            token,
          );
        } catch (error) {
          this.logger.warn(
            error instanceof Error
              ? `Notification retention lock cleanup failed: ${error.message}`
              : 'Notification retention lock cleanup failed.',
          );
        }
      }
      this.running = false;
    }
  }

  private async pruneOneBatch(): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        // Select and lock the exact notification IDs being deleted.
        // Other notification categories and non-trade FINANCE alerts survive.
        const candidates = await tx.$queryRaw<NotificationIdRow[]>(
          Prisma.sql`
            SELECT id FROM user_notifications
            WHERE sourceType IN (
              'INTERNAL_TRADE_EVENT',
              'INTERNAL_TRADE_DAILY_CLAIM_READY',
              'INTERNAL_TRADE_DAILY_CLAIMED'
            )
              AND createdAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${RETENTION_DAYS} DAY)
            ORDER BY createdAt ASC, id ASC
            LIMIT ${BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
          `,
        );
        if (!candidates.length) return 0;

        const ids = Prisma.join(candidates.map((row) => row.id));

        // Restrictive FK: deliveries must be deleted before parent alerts.
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM user_notification_push_deliveries
          WHERE notificationId IN (${ids})
        `);

        return Number(
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM user_notifications
            WHERE id IN (${ids})
              AND sourceType IN (
                'INTERNAL_TRADE_EVENT',
                'INTERNAL_TRADE_DAILY_CLAIM_READY',
                'INTERNAL_TRADE_DAILY_CLAIMED'
              )
              AND createdAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${RETENTION_DAYS} DAY)
          `),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
