import { Module } from '@nestjs/common';
import { AdminNotificationsController } from './admin-notifications.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TradeWebPushController } from './trade-web-push.controller';
import { TradeWebPushService } from './trade-web-push.service';

@Module({
  controllers: [NotificationsController, AdminNotificationsController, TradeWebPushController],
  providers: [NotificationsService, TradeWebPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
