import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OperationsConfigService } from '../platform-config/operations-config.service';
import { RedisService } from '../redis/redis.service';
import {
  INTERNAL_TRADING_WORKER_CURSOR_KEY,
  INTERNAL_TRADING_WORKER_CURSOR_TTL_MS,
  INTERNAL_TRADING_WORKER_DEFAULT_BATCH_SIZE,
  INTERNAL_TRADING_WORKER_DEFAULT_INTERVAL_MS,
  INTERNAL_TRADING_WORKER_LOCK_KEY,
  INTERNAL_TRADING_WORKER_MIN_LOCK_TTL_MS,
} from './internal-trading-worker.constants';
import { InternalTradingTradeService } from './internal-trading-trade.service';

interface WorkerFailure {
  subscriptionId: string;
  message: string;
}

export interface InternalTradingWorkerSummary {
  scannedSubscriptions: number;
  processedSubscriptions: number;
  createdEvents: number;
  createdSettlements: number;
  failedSubscriptions: number;
  failures: WorkerFailure[];
  cursor: string | null;
}

interface WorkerHealth {
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  lastSummary: InternalTradingWorkerSummary | null;
}

@Injectable()
export class InternalTradingWorkerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(InternalTradingWorkerService.name);

  private timer: NodeJS.Timeout | null = null;

  private running = false;

  private readonly health: WorkerHealth = {
    lastStartedAt: null,
    lastCompletedAt: null,
    lastErrorAt: null,
    lastError: null,
    lastSummary: null,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly tradeService: InternalTradingTradeService,
    private readonly operationsConfigService: OperationsConfigService,
  ) {}

  onModuleInit() {
    if (!this.infrastructureEnabled()) {
      this.logger.log('Internal trading worker infrastructure is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();

    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);

    this.timer.unref();

    this.logger.log(
      `Internal trading worker scheduler armed at ${intervalMs}ms interval; Operations mode remains authoritative.`,
    );
  }

  onApplicationShutdown() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = null;
  }

  async getRuntimeStatus() {
    const operations = await this.operationsConfigService.getOperations();

    const infrastructureEnabled = this.infrastructureEnabled();

    return {
      infrastructureEnabled,
      operationsMode: operations.operationsMode,
      platformTimezone: operations.platformTimezone,
      automaticProcessingEnabled:
        infrastructureEnabled && operations.operationsMode === 'AUTOMATIC',
      intervalMs: this.intervalMs(),
      batchSize: this.batchSize(),
      running: this.running,
      ...this.health,
    };
  }

  private async runOnce() {
    if (this.running) {
      return;
    }

    this.running = true;

    const token = randomUUID();

    const intervalMs = this.intervalMs();

    const lockTtlMs = Math.max(
      intervalMs * 2,
      INTERNAL_TRADING_WORKER_MIN_LOCK_TTL_MS,
    );

    this.health.lastStartedAt = new Date();

    try {
      if (!(await this.operationsConfigService.isAutomatic())) {
        return;
      }

      const redis = this.redisService.getClient();

      const acquired = await redis.set(
        INTERNAL_TRADING_WORKER_LOCK_KEY,
        token,
        'PX',
        lockTtlMs,
        'NX',
      );

      if (acquired !== 'OK') {
        return;
      }

      try {
        const batchSize = this.batchSize();

        let cursor =
          (await redis.get(INTERNAL_TRADING_WORKER_CURSOR_KEY)) || null;

        let candidates = await this.tradeService.listWorkerCandidates(
          cursor,
          batchSize,
        );

        // Cursor reached the end. Wrap around so every ACTIVE
        // subscription is revisited without starvation.
        if (candidates.length === 0 && cursor !== null) {
          cursor = null;

          candidates = await this.tradeService.listWorkerCandidates(
            null,
            batchSize,
          );
        }

        const summary: InternalTradingWorkerSummary = {
          scannedSubscriptions: candidates.length,
          processedSubscriptions: 0,
          createdEvents: 0,
          createdSettlements: 0,
          failedSubscriptions: 0,
          failures: [],
          cursor,
        };

        for (const subscriptionId of candidates) {
          try {
            const result = await this.tradeService.reconcileSubscription(
              subscriptionId,
              null,
              {},
              'WORKER',
            );

            summary.processedSubscriptions += 1;
            summary.createdEvents += Number(result.createdEvents ?? 0);
            summary.createdSettlements += Number(
              result.createdSettlements ?? 0,
            );
          } catch (error) {
            summary.failedSubscriptions += 1;

            if (summary.failures.length < 20) {
              summary.failures.push({
                subscriptionId,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Unknown internal trading worker error.',
              });
            }

            this.logger.error(
              error instanceof Error
                ? `ITD worker failed subscription ${subscriptionId}: ${error.message}`
                : `ITD worker failed subscription ${subscriptionId}.`,
            );
          }
        }

        const lastCandidate = candidates[candidates.length - 1] ?? null;

        if (lastCandidate) {
          await redis.set(
            INTERNAL_TRADING_WORKER_CURSOR_KEY,
            lastCandidate,
            'PX',
            INTERNAL_TRADING_WORKER_CURSOR_TTL_MS,
          );

          summary.cursor = lastCandidate;
        }

        this.health.lastCompletedAt = new Date();
        this.health.lastError = null;
        this.health.lastSummary = summary;

        if (
          summary.createdEvents > 0 ||
          summary.createdSettlements > 0 ||
          summary.failedSubscriptions > 0
        ) {
          this.logger.log(
            `Internal trading worker scanned ${summary.scannedSubscriptions}, created ${summary.createdEvents} event(s), created ${summary.createdSettlements} settlement(s), failures ${summary.failedSubscriptions}.`,
          );
        }
      } catch (error) {
        this.noteFailure(error);

        this.logger.error(
          error instanceof Error
            ? `Internal trading worker failed: ${error.message}`
            : 'Internal trading worker failed with an unknown error.',
        );
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          INTERNAL_TRADING_WORKER_LOCK_KEY,
          token,
        );
      }
    } catch (error) {
      this.noteFailure(error);

      this.logger.error(
        error instanceof Error
          ? `Internal trading worker orchestration failed: ${error.message}`
          : 'Internal trading worker orchestration failed with an unknown error.',
      );
    } finally {
      this.running = false;
    }
  }

  private noteFailure(error: unknown) {
    const now = new Date();

    this.health.lastCompletedAt = now;
    this.health.lastErrorAt = now;
    this.health.lastError =
      error instanceof Error
        ? error.message
        : 'Unknown internal trading worker error.';
  }

  private infrastructureEnabled(): boolean {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return false;
    }

    const configured = this.configService.get<string | boolean>(
      'INTERNAL_TRADING_WORKER_ENABLED',
    );

    if (typeof configured === 'boolean') {
      return configured;
    }

    if (typeof configured === 'string') {
      return ['true', '1', 'yes', 'on'].includes(configured.toLowerCase());
    }

    return false;
  }

  private intervalMs(): number {
    const configured = this.configService.get<number | string>(
      'INTERNAL_TRADING_WORKER_INTERVAL_MS',
    );

    const parsed = Number(
      configured ?? INTERNAL_TRADING_WORKER_DEFAULT_INTERVAL_MS,
    );

    return Number.isFinite(parsed) && parsed >= 10_000
      ? Math.floor(parsed)
      : INTERNAL_TRADING_WORKER_DEFAULT_INTERVAL_MS;
  }

  private batchSize(): number {
    const configured = this.configService.get<number | string>(
      'INTERNAL_TRADING_WORKER_BATCH_SIZE',
    );

    const parsed = Number(
      configured ?? INTERNAL_TRADING_WORKER_DEFAULT_BATCH_SIZE,
    );

    return Number.isFinite(parsed) && parsed >= 1
      ? Math.min(1000, Math.floor(parsed))
      : INTERNAL_TRADING_WORKER_DEFAULT_BATCH_SIZE;
  }
}
