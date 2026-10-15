import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { RedisModule } from '../redis/redis.module';
import { AdminInternalTradingLifecycleController } from './admin-internal-trading-lifecycle.controller';
import { AdminInternalTradingPoliciesController } from './admin-internal-trading.controller';
import { AdminInternalTradingTradeController } from './admin-internal-trading-trade.controller';
import { CanonicalInternalTradingTradeService } from './canonical-internal-trading-trade.service';
import { InternalTradingController } from './internal-trading.controller';
import { InternalTradingLifecycleService } from './internal-trading-lifecycle.service';
import { InternalTradingPackageCompletionService } from './internal-trading-package-completion.service';
import { InternalTradingTradeService } from './internal-trading-trade.service';
import { InternalTradingService } from './internal-trading.service';
import { InternalTradingWorkerService } from './internal-trading-worker.service';
import { InternalTradingV2TradeService } from './internal-trading-v2-trade.service';
import { InternalTradingDailyClaimService } from './internal-trading-daily-claim.service';
import {
  InternalTradingClaimsReadController,
  InternalTradingClaimsWriteController,
} from './internal-trading-claim.controller';

@Module({
  imports: [PlatformConfigModule, RedisModule],
  controllers: [
    AdminInternalTradingPoliciesController,
    AdminInternalTradingLifecycleController,
    AdminInternalTradingTradeController,
    InternalTradingController,
    InternalTradingClaimsReadController,
    InternalTradingClaimsWriteController,
  ],
  providers: [
    InternalTradingService,
    InternalTradingV2TradeService,
    InternalTradingDailyClaimService,
    InternalTradingLifecycleService,
    InternalTradingPackageCompletionService,
    {
      provide: InternalTradingTradeService,
      useClass: CanonicalInternalTradingTradeService,
    },
    InternalTradingWorkerService,
  ],
  exports: [
    InternalTradingLifecycleService,
    InternalTradingPackageCompletionService,
    InternalTradingTradeService,
  ],
})
export class InternalTradingModule {}
