import { Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { AccountingConfigController } from './accounting-config.controller';
import { AccountingConfigService } from './accounting-config.service';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';

@Module({
  imports: [SecurityConfigModule],
  controllers: [PlatformConfigController, AccountingConfigController],
  providers: [PlatformConfigService, AccountingConfigService],
  exports: [PlatformConfigService, AccountingConfigService],
})
export class PlatformConfigModule {}
