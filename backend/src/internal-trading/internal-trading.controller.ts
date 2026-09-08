import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { AllowUserImpersonation } from '../auth/allow-user-impersonation.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { InternalTradingEventQueryDto } from './dto/internal-trading-trade.dto';
import { InternalTradingTradeService } from './internal-trading-trade.service';

@AllowUserImpersonation()
@Controller('internal-trading')
export class InternalTradingController {
  constructor(private readonly service: InternalTradingTradeService) {}

  @Get('me/packages')
  @Header('Cache-Control', 'no-store')
  getMyPackages(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMyPackages(user.id);
  }

  @Get('me/packages/:subscriptionId')
  @Header('Cache-Control', 'no-store')
  getMyPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('subscriptionId', new ParseUUIDPipe())
    subscriptionId: string,
  ) {
    return this.service.getMyPackage(user.id, subscriptionId);
  }

  @Get('me/packages/:subscriptionId/events')
  @Header('Cache-Control', 'no-store')
  getMyEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('subscriptionId', new ParseUUIDPipe())
    subscriptionId: string,
    @Query() query: InternalTradingEventQueryDto,
  ) {
    return this.service.listMyEvents(user.id, subscriptionId, query);
  }
}
