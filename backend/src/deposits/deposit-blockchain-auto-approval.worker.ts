import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { DepositApprovalModeService } from './deposit-approval-mode.service';
import { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';

const WORKER_INTERVAL_MS = 60_000;
const WORKER_LOCK_TTL_MS = 120_000;
const WORKER_LOCK_KEY = 'fixtradezone:deposits:blockchain-auto-approval';

@Injectable()
export class DepositBlockchainAutoApprovalWorker
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(
    DepositBlockchainAutoApprovalWorker.name,
  );
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly approvalMode: DepositApprovalModeService,
    private readonly processing: DepositBlockchainProcessingService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return;

    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, WORKER_INTERVAL_MS);
    this.timer.unref();
    this.logger.log(
      'Deposit blockchain auto-approval worker armed at 60000ms; only rails explicitly set to AUTO_AFTER_BLOCKCHAIN_VERIFIED are eligible.',
    );
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const candidates = await this.approvalMode.listAutomaticCandidates();
      if (candidates.length === 0) return;

      const client = this.redis.getClient();
      const token = randomUUID();
      const acquired = await client.set(
        WORKER_LOCK_KEY,
        token,
        'PX',
        WORKER_LOCK_TTL_MS,
        'NX',
      );
      if (acquired !== 'OK') return;

      try {
        for (const depositId of candidates) {
          try {
            await this.processing.processAutomaticCandidate(depositId);
          } catch (error) {
            this.logger.warn(
              `Automatic blockchain processing skipped deposit ${depositId}: ${this.errorMessage(error)}`,
            );
          }
        }
      } finally {
        await client.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          1,
          WORKER_LOCK_KEY,
          token,
        );
      }
    } catch (error) {
      this.logger.error(
        `Deposit blockchain auto-approval worker failed safely: ${this.errorMessage(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
