import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { InternalTradingModule } from '../internal-trading/internal-trading.module';
import { RewardsModule } from '../rewards/rewards.module';
import {
  AdminDepositSubscriptionController,
  AdminSubscriptionsController,
} from './admin-subscriptions.controller';
import { SubscriptionActivationOrchestratorService } from './subscription-activation-orchestrator.service';
import { SubscriptionPostActivationService } from './subscription-post-activation.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [CommissionsModule, RewardsModule, InternalTradingModule],
  controllers: [
    SubscriptionsController,
    AdminSubscriptionsController,
    AdminDepositSubscriptionController,
  ],
  providers: [
    SubscriptionsService,
    SubscriptionPostActivationService,
    SubscriptionActivationOrchestratorService,
  ],
  exports: [SubscriptionsService, SubscriptionPostActivationService],
})
export class SubscriptionsModule {}
