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
  AWARD_REWARD_WORKER_DEFAULT_INTERVAL_MS,
  AWARD_REWARD_WORKER_LOCK_KEY,
} from './award-rewards.constants';
import { AwardRewardsService } from './award-rewards.service';

const AWARD_REWARD_WORKER_MIN_LOCK_TTL_MS = 15 * 60_000;

@Injectable()
export class AwardRewardWorkerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AwardRewardWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly awardRewardsService: AwardRewardsService,
    private readonly operationsConfigService: OperationsConfigService,
  ) {}

  onModuleInit() {
    if (!this.infrastructureEnabled()) {
      this.logger.log(
        'Team Business Awards worker infrastructure is disabled.',
      );
      return;
    }

    const intervalMs = this.intervalMs();
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(
      `Team Business Awards worker scheduler armed at ${intervalMs}ms interval; Operations mode remains authoritative.`,
    );
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
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
    };
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    const token = randomUUID();
    const intervalMs = this.intervalMs();
    const lockTtlMs = Math.max(
      intervalMs * 2,
      AWARD_REWARD_WORKER_MIN_LOCK_TTL_MS,
    );

    try {
      if (!(await this.operationsConfigService.isAutomatic())) return;

      const redis = this.redisService.getClient();
      const acquired = await redis.set(
        AWARD_REWARD_WORKER_LOCK_KEY,
        token,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (acquired !== 'OK') return;

      try {
        const summary = await this.awardRewardsService.reconcile(
          undefined,
          null,
          {},
          true,
        );
        if (summary.startedTracks > 0 || summary.awardsPosted > 0) {
          this.logger.log(
            `Team Business Awards worker processed ${summary.usersProcessed} users, started ${summary.startedTracks} tracks, posted ${summary.awardsPosted} awards.`,
          );
        }
      } catch (error) {
        this.logger.error(
          error instanceof Error
            ? `Team Business Awards worker failed: ${error.message}`
            : 'Team Business Awards worker failed with an unknown error.',
        );
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          AWARD_REWARD_WORKER_LOCK_KEY,
          token,
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? `Team Business Awards worker orchestration failed: ${error.message}`
          : 'Team Business Awards worker orchestration failed with an unknown error.',
      );
    } finally {
      this.running = false;
    }
  }

  private infrastructureEnabled() {
    if (this.configService.get<string>('NODE_ENV') === 'test') return false;
    const configured = this.configService.get<string | boolean>(
      'AWARD_REWARD_WORKER_ENABLED',
    );
    if (typeof configured === 'boolean') return configured;
    if (typeof configured === 'string') {
      return !['false', '0', 'no', 'off'].includes(configured.toLowerCase());
    }
    return true;
  }

  private intervalMs() {
    const configured = this.configService.get<number | string>(
      'AWARD_REWARD_WORKER_INTERVAL_MS',
    );
    const parsed = Number(
      configured ?? AWARD_REWARD_WORKER_DEFAULT_INTERVAL_MS,
    );
    return Number.isFinite(parsed) && parsed >= 10_000
      ? Math.floor(parsed)
      : AWARD_REWARD_WORKER_DEFAULT_INTERVAL_MS;
  }
}
