import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AccountingConfigController } from './accounting-config.controller';
import { AccountingConfigService } from './accounting-config.service';
import { OperationsConfigController } from './operations-config.controller';
import { OperationsConfigService } from './operations-config.service';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';
import { PlatformTimeController } from './platform-time.controller';
import {
  AdminSiteModeController,
  PublicSiteModeController,
} from './site-mode.controller';
import { SiteModeSchedulerService } from './site-mode-scheduler.service';
import { SiteModeService } from './site-mode.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [
    PlatformConfigController,
    AccountingConfigController,
    OperationsConfigController,
    PlatformTimeController,
    PublicSiteModeController,
    AdminSiteModeController,
  ],
  providers: [
    PlatformConfigService,
    AccountingConfigService,
    OperationsConfigService,
    SiteModeService,
    SiteModeSchedulerService,
  ],
  exports: [
    PlatformConfigService,
    AccountingConfigService,
    OperationsConfigService,
    SiteModeService,
  ],
})
export class PlatformConfigModule {}
