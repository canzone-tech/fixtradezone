import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MarketDataController } from './market-data.controller';

@Module({
  controllers: [DashboardController, MarketDataController],
  providers: [DashboardService],
})
export class DashboardModule {}
