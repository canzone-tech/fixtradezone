import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import {
  AdminSimulatedActivityController,
  AdminSimulatedActivityPoliciesController,
  AdminSubscriptionSimulatedActivityController,
} from './admin-simulated-activity.controller';
import { SimulatedActivityController } from './simulated-activity.controller';
import { SimulatedActivityService } from './simulated-activity.service';
import { SimulatedActivityWorkerService } from './simulated-activity.worker.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [
    SimulatedActivityController,
    AdminSimulatedActivityPoliciesController,
    AdminSimulatedActivityController,
    AdminSubscriptionSimulatedActivityController,
  ],
  providers: [SimulatedActivityService, SimulatedActivityWorkerService],
  exports: [SimulatedActivityService],
})
export class SimulatedActivityModule {}
