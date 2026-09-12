import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminPayoutPoliciesController } from './admin-payout-policies.controller';
import { AdminPayoutsController } from './admin-payouts.controller';
import { PayoutAccountingService } from './payout-accounting.service';
import { PayoutPolicyService } from './payout-policy.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [
    PayoutsController,
    AdminPayoutsController,
    AdminPayoutPoliciesController,
  ],
  providers: [PayoutsService, PayoutPolicyService, PayoutAccountingService],
  exports: [PayoutsService, PayoutPolicyService],
})
export class PayoutsModule {}
