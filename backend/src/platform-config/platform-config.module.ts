import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AccountingConfigController } from './accounting-config.controller';
import { AccountingConfigService } from './accounting-config.service';
import { OperationsConfigController } from './operations-config.controller';
import { OperationsConfigService } from './operations-config.service';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';
import { PlatformTimeController } from './platform-time.controller';

@Module({
  imports: [SecurityConfigModule],
  controllers: [
    PlatformConfigController,
    AccountingConfigController,
    OperationsConfigController,
    PlatformTimeController,
  ],
  providers: [
    PlatformConfigService,
    AccountingConfigService,
    OperationsConfigService,
  ],
  exports: [
    PlatformConfigService,
    AccountingConfigService,
    OperationsConfigService,
  ],
})
export class PlatformConfigModule {}
