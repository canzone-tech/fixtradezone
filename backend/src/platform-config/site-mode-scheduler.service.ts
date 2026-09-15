import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { SiteModeService } from './site-mode.service';

const SITE_MODE_SCHEDULER_INTERVAL_MS = 30_000;

@Injectable()
export class SiteModeSchedulerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(SiteModeSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly siteModeService: SiteModeService) {}

  onModuleInit(): void {
    void this.runOnce();
    this.timer = setInterval(() => {
      void this.runOnce();
    }, SITE_MODE_SCHEDULER_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const changed = await this.siteModeService.activateScheduledLiveIfDue();
      if (changed) {
        this.logger.log(
          'Scheduled Platform Mode transition completed: LIVE / AUTOMATIC.',
        );
      }
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? `Platform Mode scheduler failed safely: ${error.message}`
          : 'Platform Mode scheduler failed safely.',
      );
    } finally {
      this.running = false;
    }
  }
}
