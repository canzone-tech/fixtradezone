import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import {
  InternalTradingEventQueryDto,
  InternalTradingWorkspaceQueryDto,
} from './dto/internal-trading-trade.dto';
import { InternalTradingTradeService } from './internal-trading-trade.service';
import { InternalTradingWorkerService } from './internal-trading-worker.service';

@Controller('admin/internal-trading')
export class AdminInternalTradingTradeController {
  constructor(
    private readonly service: InternalTradingTradeService,
    private readonly worker: InternalTradingWorkerService,
  ) {}

  @Get('workspace')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_READ)
  getWorkspace(@Query() query: InternalTradingWorkspaceQueryDto) {
    return this.service.listAdminWorkspace(query);
  }

  @Get('subscriptions/:subscriptionId/events')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_READ)
  listEvents(
    @Param('subscriptionId', new ParseUUIDPipe())
    subscriptionId: string,
    @Query() query: InternalTradingEventQueryDto,
  ) {
    return this.service.listAdminEvents(subscriptionId, query);
  }

  @Get('worker-health')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_READ)
  getWorkerHealth() {
    return this.worker.getRuntimeStatus();
  }

  @Post('subscriptions/:subscriptionId/reconcile-trades')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_RECONCILE)
  reconcileTrades(
    @Param('subscriptionId', new ParseUUIDPipe())
    subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.reconcileSubscription(
      subscriptionId,
      actor,
      getRequestContext(request),
    );
  }
}
