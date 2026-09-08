import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import {
  AdminRewardPoliciesController,
  AdminRewardsController,
  AdminSubscriptionRewardsController,
} from './admin-rewards.controller';
import { RewardWorkerService } from './reward-worker.service';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  imports: [PlatformConfigModule],
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
