import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { RedisModule } from '../redis/redis.module';
import { AdminInternalTradingLifecycleController } from './admin-internal-trading-lifecycle.controller';
import { AdminInternalTradingPoliciesController } from './admin-internal-trading.controller';
import { AdminInternalTradingTradeController } from './admin-internal-trading-trade.controller';
import { InternalTradingController } from './internal-trading.controller';
import { InternalTradingLifecycleService } from './internal-trading-lifecycle.service';
import { InternalTradingTradeService } from './internal-trading-trade.service';
import { InternalTradingService } from './internal-trading.service';
import { InternalTradingWorkerService } from './internal-trading-worker.service';

@Module({
  imports: [PlatformConfigModule, RedisModule],
  controllers: [
    AdminInternalTradingPoliciesController,
    AdminInternalTradingLifecycleController,
    AdminInternalTradingTradeController,
    InternalTradingController,
  ],
  providers: [
    InternalTradingService,
    InternalTradingLifecycleService,
    InternalTradingTradeService,
    InternalTradingWorkerService,
  ],
  exports: [InternalTradingLifecycleService, InternalTradingTradeService],
})
export class InternalTradingModule {}
