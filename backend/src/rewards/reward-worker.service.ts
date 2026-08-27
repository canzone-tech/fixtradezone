import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import {
  REWARD_WORKER_DEFAULT_INTERVAL_MS,
  REWARD_WORKER_LOCK_KEY,
} from './rewards.constants';
import { RewardsService } from './rewards.service';

@Injectable()
export class RewardWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RewardWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly rewardsService: RewardsService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('Package reward worker is disabled.');
      return;
    }

    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Package reward worker enabled at ${intervalMs}ms interval.`);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    const token = randomUUID();
    const intervalMs = this.intervalMs();
    const lockTtlMs = Math.max(intervalMs - 1_000, 10_000);

    try {
      const redis = this.redisService.getClient();
      const acquired = await redis.set(
        REWARD_WORKER_LOCK_KEY,
        token,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (acquired !== 'OK') return;

      try {
        this.rewardsService.noteWorkerStart();
        const summary = await this.rewardsService.processDueBatch(null, {}, true);
        this.rewardsService.noteWorkerSuccess(summary);
        if (summary.createdEvents > 0 || summary.initialized > 0) {
          this.logger.log(
            `Reward worker initialized ${summary.initialized}, posted ${summary.createdEvents}, remaining due ${summary.remainingDue}.`,
          );
        }
      } catch (error) {
        this.rewardsService.noteWorkerFailure(error);
        this.logger.error(
          error instanceof Error
            ? `Reward worker failed: ${error.message}`
            : 'Reward worker failed with an unknown error.',
        );
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          REWARD_WORKER_LOCK_KEY,
          token,
        );
      }
    } catch (error) {
      this.rewardsService.noteWorkerFailure(error);
      this.logger.error(
        error instanceof Error
          ? `Reward worker lock failed: ${error.message}`
          : 'Reward worker lock failed with an unknown error.',
      );
    } finally {
      this.running = false;
    }
  }

  private isEnabled() {
    if (this.configService.get<string>('NODE_ENV') === 'test') return false;
    const configured = this.configService.get<string | boolean>(
      'REWARD_WORKER_ENABLED',
    );
    if (typeof configured === 'boolean') return configured;
    if (typeof configured === 'string') {
      return !['false', '0', 'no', 'off'].includes(configured.toLowerCase());
    }
    return true;
  }

  private intervalMs() {
    const configured = this.configService.get<number | string>(
      'REWARD_WORKER_INTERVAL_MS',
    );
    const parsed = Number(configured ?? REWARD_WORKER_DEFAULT_INTERVAL_MS);
    return Number.isFinite(parsed) && parsed >= 10_000
      ? Math.floor(parsed)
      : REWARD_WORKER_DEFAULT_INTERVAL_MS;
  }
}
