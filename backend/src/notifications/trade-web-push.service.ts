import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, OnApplicationShutdown, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { WebPushSubscriptionDto } from './dto/web-push-subscription.dto';

interface SubscriptionRow {
  id: string;
  userId: string;
}
interface PushDeliveryRow {
  id: string;
  userId: string;
  notificationId: string;
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  message: string;
  attempts: number;
}
const WORKER_LOCK_KEY = 'ftz:notifications:web-push:v1:worker-lock';
const DELIVERY_LIMIT = 50;
const MAX_ATTEMPTS = 6;

/** Do not accept arbitrary URLs: this endpoint is contacted by the backend worker. */
export function validatedPushEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid push endpoint.');
  }
  const host = url.hostname.toLowerCase();
  const supported =
    host === 'fcm.googleapis.com' ||
    host === 'android.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' ||
    host === 'web.push.apple.com' ||
    host.endsWith('.push.apple.com') ||
    host.endsWith('.notify.windows.com');

  if (
    url.protocol !== 'https:' ||
    !supported ||
    (url.port !== '' && url.port !== '443') ||
    url.username !== '' ||
    url.password !== '' ||
    raw.length > 2048
  ) {
    throw new BadRequestException('Unsupported browser push endpoint.');
  }
  return url.href;
}

@Injectable()
export class TradeWebPushService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TradeWebPushService.name);
  private readonly enabled: boolean;
  private readonly publicKey: string;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.publicKey = this.config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey = this.config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim() ?? '';
    const subject = this.config.get<string>('WEB_PUSH_VAPID_SUBJECT')?.trim() ?? '';
    const switchedOn = this.config.get<string | boolean>('WEB_PUSH_ENABLED');
    this.enabled = (switchedOn === true || switchedOn === 'true') &&
      Boolean(this.publicKey && privateKey && subject);
    const interval = Number(this.config.get<string | number>('WEB_PUSH_WORKER_INTERVAL_MS') ?? 30000);
    this.intervalMs = Number.isFinite(interval) && interval >= 10000 && interval <= 3600000
      ? Math.floor(interval) : 30000;
    if (this.enabled) webPush.setVapidDetails(subject, this.publicKey, privateKey);
  }

  getPublicConfig() {
    return { enabled: this.enabled, publicKey: this.enabled ? this.publicKey : null };
  }

  onModuleInit() {
    if (!this.enabled || this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => { void this.dispatchDue(); }, this.intervalMs);
    this.timer.unref();
    this.logger.log('Web Push WIN/LOSS dispatcher enabled.');
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async register(userId: string, input: WebPushSubscriptionDto) {
    this.ensureEnabled();
    const endpoint = validatedPushEndpoint(input.endpoint);
    const endpointHash = createHash('sha256').update(endpoint).digest('hex');
    return this.prisma.$transaction(async tx => {
      const found = await tx.$queryRaw<SubscriptionRow[]>(Prisma.sql`
        SELECT id, userId FROM user_web_push_subscriptions
        WHERE endpointHash = ${endpointHash} LIMIT 1 FOR UPDATE
      `);
      const existing = found[0];
      if (existing) {
        // Moving a browser endpoint between USERs must drop previous delivery
        // attempts so account A's alerts never go to account B's session.
        // Opting in again is a fresh delivery boundary. Cancel stale
        // pending retries whether the browser stayed on one USER or switched.
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM user_notification_push_deliveries
          WHERE subscriptionId = ${existing.id}
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE user_web_push_subscriptions
          SET userId = ${userId}, endpoint = ${endpoint}, p256dh = ${input.p256dh},
              auth = ${input.auth}, active = TRUE,
              createdAt = CURRENT_TIMESTAMP(3), updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${existing.id}
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO user_web_push_subscriptions
            (id, userId, endpointHash, endpoint, p256dh, auth, active, createdAt, updatedAt)
          VALUES (${randomUUID()}, ${userId}, ${endpointHash}, ${endpoint},
            ${input.p256dh}, ${input.auth}, TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
        `);
      }
      return { subscribed: true };
    });
  }

  async unsubscribe(userId: string, rawEndpoint: string) {
    this.ensureEnabled();
    const hash = createHash('sha256')
      .update(validatedPushEndpoint(rawEndpoint)).digest('hex');
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE user_web_push_subscriptions SET active = FALSE, updatedAt = CURRENT_TIMESTAMP(3)
      WHERE userId = ${userId} AND endpointHash = ${hash}
    `);
    return { subscribed: false };
  }

  private ensureEnabled() {
    if (!this.enabled) throw new ServiceUnavailableException('Browser push is not configured.');
  }

  private async dispatchDue() {
    if (this.running) return;
    this.running = true;
    const token = randomUUID();
    let acquired = false;
    try {
      const client = this.redis.getClient();
      const lock = await client.set(WORKER_LOCK_KEY, token, 'PX', 180000, 'NX');
      if (lock !== 'OK') return;
      acquired = true;
      await this.queueNewTradeAlerts();
      for (let batch = 0; batch < 1; batch += 1) {
        const deliveries = await this.claimDeliveries();
        if (!deliveries.length) break;
        for (const delivery of deliveries) await this.sendDelivery(delivery, token);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Web Push dispatcher failed.');
    } finally {
      if (acquired) {
        try {
          await this.redis.getClient().eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1, WORKER_LOCK_KEY, token,
          );
        } catch (error) {
          this.logger.warn(error instanceof Error ? error.message : 'Web Push lock cleanup failed.');
        }
      }
      this.running = false;
    }
  }

  private async queueNewTradeAlerts() {
    // Store one durable delivery per committed notification and opted-in
    // browser. Subscribing never retroactively pushes old inbox history.
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT IGNORE INTO user_notification_push_deliveries
        (id, notificationId, subscriptionId, status, attempts, nextAttemptAt, createdAt, updatedAt)
      SELECT UUID(), n.id, s.id, 'PENDING', 0, CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
      FROM user_notifications n
      INNER JOIN user_web_push_subscriptions s
        ON s.userId = n.userId AND s.active = TRUE
        AND n.createdAt >= s.createdAt
      LEFT JOIN user_notification_push_deliveries d
        ON d.notificationId = n.id AND d.subscriptionId = s.id
      WHERE n.sourceType = 'INTERNAL_TRADE_EVENT'
        AND n.createdAt >= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 2 DAY)
        AND d.id IS NULL
      ORDER BY n.createdAt ASC
      LIMIT ${DELIVERY_LIMIT * 10}
    `);
  }

  private claimDeliveries(): Promise<PushDeliveryRow[]> {
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<PushDeliveryRow[]>(Prisma.sql`
        SELECT d.id, d.notificationId, d.subscriptionId, n.userId, s.endpoint, s.p256dh, s.auth,
          n.title, n.message, d.attempts
        FROM user_notification_push_deliveries d
        JOIN user_web_push_subscriptions s ON s.id = d.subscriptionId
        JOIN user_notifications n ON n.id = d.notificationId AND n.userId = s.userId
        WHERE s.active = TRUE
          AND d.nextAttemptAt <= CURRENT_TIMESTAMP(3)
          AND (d.status IN ('PENDING', 'RETRY')
            OR (d.status = 'SENDING' AND d.lockedUntil < CURRENT_TIMESTAMP(3)))
        ORDER BY d.createdAt, d.id
        LIMIT ${DELIVERY_LIMIT}
        FOR UPDATE SKIP LOCKED
      `);
      for (const row of rows) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE user_notification_push_deliveries
          SET status = 'SENDING', claimToken = ${row.id},
            attempts = attempts + 1,
            lockedUntil = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 2 MINUTE),
            updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${row.id}
        `);
      }
      return rows;
    });
  }

  private async sendDelivery(row: PushDeliveryRow, _workerToken: string) {
    const payload = JSON.stringify({
      id: row.notificationId,
      userId: row.userId,
      title: row.title,
      body: row.message,
      url: '/user/trading',
    });
    try {
      await webPush.sendNotification({
        endpoint: validatedPushEndpoint(row.endpoint),
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, payload, { TTL: 3600, urgency: 'normal' });
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE user_notification_push_deliveries
        SET status = 'SENT', sentAt = CURRENT_TIMESTAMP(3),
          claimToken = NULL, lockedUntil = NULL, updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${row.id} AND status = 'SENDING' AND claimToken = ${row.id}
      `);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
      const expired = code === 404 || code === 410;
      const permanent = expired || code === 400 || code === 403 || Number(row.attempts) + 1 >= MAX_ATTEMPTS;
      const delaySeconds = Math.min(3600, 30 * (2 ** Math.min(Number(row.attempts), 6)));
      if (expired) {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE user_web_push_subscriptions SET active = FALSE,
            updatedAt = CURRENT_TIMESTAMP(3) WHERE id = ${row.subscriptionId}
        `);
      }
      // Error messages can include endpoint details; never persist them.
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE user_notification_push_deliveries
        SET status = ${permanent ? 'FAILED' : 'RETRY'},
          lastError = ${code ? `Push endpoint returned HTTP ${code}` : 'Push transport unavailable'},
          nextAttemptAt = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${delaySeconds} SECOND),
          claimToken = NULL, lockedUntil = NULL, updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${row.id} AND status = 'SENDING' AND claimToken = ${row.id}
      `);
    }
  }
}
