import { Body, Controller, Delete, Get, Header, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { WebPushSubscriptionDto, WebPushUnsubscribeDto } from './dto/web-push-subscription.dto';
import { TradeWebPushService } from './trade-web-push.service';

@Controller('notifications/push')
export class TradeWebPushController {
  constructor(private readonly webPush: TradeWebPushService) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  getConfig() {
    return this.webPush.getPublicConfig();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  register(@CurrentUser() actor: AuthenticatedUser, @Body() dto: WebPushSubscriptionDto) {
    return this.webPush.register(actor.id, dto);
  }

  @Delete()
  @Header('Cache-Control', 'no-store')
  unsubscribe(@CurrentUser() actor: AuthenticatedUser, @Body() dto: WebPushUnsubscribeDto) {
    return this.webPush.unsubscribe(actor.id, dto.endpoint);
  }
}
