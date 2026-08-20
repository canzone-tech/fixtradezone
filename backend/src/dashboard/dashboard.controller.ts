import {
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { DashboardService } from './dashboard.service';
import { MarketHistoryQueryDto } from './dto/market-history-query.dto';

@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('market')
  @Header(
    'Cache-Control',
    'private, max-age=10',
  )
  @RequirePermissions(
    PERMISSIONS.DASHBOARD_READ,
  )
  getMarketOverview() {
    return this.dashboardService.getMarketOverview();
  }

  @Get('market/history')
  @Header(
    'Cache-Control',
    'private, max-age=30',
  )
  @RequirePermissions(
    PERMISSIONS.DASHBOARD_READ,
  )
  getMarketHistory(
    @Query()
    query: MarketHistoryQueryDto,
  ) {
    return this.dashboardService.getMarketHistory(
      query,
    );
  }
}
