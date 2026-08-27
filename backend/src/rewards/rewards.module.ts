import { Module } from '@nestjs/common';
import {
  AdminRewardPoliciesController,
  AdminRewardsController,
  AdminSubscriptionRewardsController,
} from './admin-rewards.controller';
import { RewardWorkerService } from './reward-worker.service';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  controllers: [
    RewardsController,
    AdminRewardPoliciesController,
    AdminRewardsController,
    AdminSubscriptionRewardsController,
  ],
  providers: [RewardsService, RewardWorkerService],
  exports: [RewardsService],
})
export class RewardsModule {}
