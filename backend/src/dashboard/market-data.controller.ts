import { Controller, Get, Header, Query } from '@nestjs/common';
import { AllowUserImpersonation } from '../auth/allow-user-impersonation.decorator';
import { DashboardService } from './dashboard.service';
import { MarketHistoryQueryDto } from './dto/market-history-query.dto';

@AllowUserImpersonation()
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  getMarketOverview() {
    return this.dashboardService.getMarketOverview();
  }

  @Get('history')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  getMarketHistory(@Query() query: MarketHistoryQueryDto) {
    return this.dashboardService.getMarketHistory(query);
  }
}
