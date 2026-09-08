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
import { AdminInternalTradingStateQueryDto } from './dto/internal-trading-lifecycle.dto';
import { InternalTradingLifecycleService } from './internal-trading-lifecycle.service';

@Controller('admin/internal-trading')
export class AdminInternalTradingLifecycleController {
  constructor(
    private readonly lifecycleService: InternalTradingLifecycleService,
  ) {}

  @Get('states')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_READ)
  listStates(@Query() query: AdminInternalTradingStateQueryDto) {
    return this.lifecycleService.listStates(query);
  }

  @Get('states/:subscriptionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_READ)
  getState(
    @Param('subscriptionId', new ParseUUIDPipe())
    subscriptionId: string,
  ) {
    return this.lifecycleService.getState(subscriptionId);
  }

  @Post('subscriptions/:subscriptionId/reconcile-state')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.INTERNAL_TRADING_RECONCILE)
  reconcileState(
    @Param('subscriptionId', new ParseUUIDPipe())
    subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.lifecycleService.initializeActivatedSubscription(
      subscriptionId,
      actor,
      getRequestContext(request),
    );
  }
}
