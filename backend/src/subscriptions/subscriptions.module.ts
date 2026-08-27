import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import {
  AdminDepositSubscriptionController,
  AdminSubscriptionsController,
} from './admin-subscriptions.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [CommissionsModule],
  controllers: [
    SubscriptionsController,
    AdminSubscriptionsController,
    AdminDepositSubscriptionController,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
