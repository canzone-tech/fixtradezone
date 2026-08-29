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
  SIMULATED_ACTIVITY_DEFAULT_INTERVAL_MS,
  SIMULATED_ACTIVITY_WORKER_LOCK_KEY,
  SIMULATED_ACTIVITY_WORKER_MIN_LOCK_TTL_MS,
} from './simulated-activity.constants';
import { SimulatedActivityService } from './simulated-activity.service';

@Injectable()
export class SimulatedActivityWorkerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(SimulatedActivityWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly simulatedActivityService: SimulatedActivityService,
    private readonly operationsConfigService: OperationsConfigService,
  ) {}

  onModuleInit() {
    if (!this.infrastructureEnabled()) {
      this.logger.log('Simulated activity worker infrastructure is disabled.');
      return;
    }
    const intervalMs = this.intervalMs();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(
      `Simulated activity worker scheduler armed at ${intervalMs}ms interval; Operations mode remains authoritative.`,
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
      SIMULATED_ACTIVITY_WORKER_MIN_LOCK_TTL_MS,
    );

    try {
      if (!(await this.operationsConfigService.isAutomatic())) return;
      const redis = this.redisService.getClient();
      const acquired = await redis.set(
        SIMULATED_ACTIVITY_WORKER_LOCK_KEY,
        token,
        'PX',
        lockTtlMs,
        'NX',
      );
      if (acquired !== 'OK') return;

      try {
        this.simulatedActivityService.noteWorkerStart();
        const summary = await this.simulatedActivityService.processDueBatch(
          null,
          {},
          true,
        );
        this.simulatedActivityService.noteWorkerSuccess(summary);
        if (summary.createdEvents > 0) {
          this.logger.log(
            `Simulated activity worker created ${summary.createdEvents} event(s) across ${summary.processedSubscriptions} subscription(s).`,
          );
        }
      } catch (error) {
        this.simulatedActivityService.noteWorkerFailure(error);
        this.logger.error(
          error instanceof Error
            ? `Simulated activity worker failed: ${error.message}`
            : 'Simulated activity worker failed with an unknown error.',
        );
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          SIMULATED_ACTIVITY_WORKER_LOCK_KEY,
          token,
        );
      }
    } catch (error) {
      this.simulatedActivityService.noteWorkerFailure(error);
      this.logger.error(
        error instanceof Error
          ? `Simulated activity worker orchestration failed: ${error.message}`
          : 'Simulated activity worker orchestration failed with an unknown error.',
      );
    } finally {
      this.running = false;
    }
  }

  private infrastructureEnabled(): boolean {
    if (this.configService.get<string>('NODE_ENV') === 'test') return false;
    const configured = this.configService.get<string | boolean>(
      'SIMULATED_ACTIVITY_WORKER_ENABLED',
    );
    if (typeof configured === 'boolean') return configured;
    if (typeof configured === 'string') {
      return ['true', '1', 'yes', 'on'].includes(configured.toLowerCase());
    }
    return false;
  }

  private intervalMs(): number {
    const configured = this.configService.get<number | string>(
      'SIMULATED_ACTIVITY_WORKER_INTERVAL_MS',
    );
    const parsed = Number(
      configured ?? SIMULATED_ACTIVITY_DEFAULT_INTERVAL_MS,
    );
    return Number.isFinite(parsed) && parsed >= 10_000
      ? Math.floor(parsed)
      : SIMULATED_ACTIVITY_DEFAULT_INTERVAL_MS;
  }
}
