import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import {
  AdminAwardRewardPoliciesController,
  AdminAwardRewardsController,
} from './admin-award-rewards.controller';
import { AwardRewardWorkerService } from './award-reward-worker.service';
import { AwardRewardsController } from './award-rewards.controller';
import { AwardRewardsService } from './award-rewards.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [
    AwardRewardsController,
    AdminAwardRewardPoliciesController,
    AdminAwardRewardsController,
  ],
  providers: [AwardRewardsService, AwardRewardWorkerService],
  exports: [AwardRewardsService],
})
export class AwardRewardsModule {}
