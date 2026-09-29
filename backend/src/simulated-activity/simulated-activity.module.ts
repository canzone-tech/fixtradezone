import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import {
  AdminSimulatedActivityController,
  AdminSimulatedActivityPoliciesController,
  AdminSubscriptionSimulatedActivityController,
} from './admin-simulated-activity.controller';
import { SimulatedActivityController } from './simulated-activity.controller';
import { SimulatedActivityFinalDayRecoveryService } from './simulated-activity-final-day-recovery.service';
import { SimulatedActivityInitialDraftService } from './simulated-activity-initial-draft.service';
import { SimulatedActivityService } from './simulated-activity.service';
import { SimulatedActivityUserViewService } from './simulated-activity-user-view.service';
import { SimulatedActivityWorkerService } from './simulated-activity.worker.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [
    SimulatedActivityController,
    AdminSimulatedActivityPoliciesController,
    AdminSimulatedActivityController,
    AdminSubscriptionSimulatedActivityController,
  ],
  providers: [
    SimulatedActivityService,
    SimulatedActivityInitialDraftService,
    SimulatedActivityUserViewService,
    SimulatedActivityFinalDayRecoveryService,
    SimulatedActivityWorkerService,
  ],
  exports: [SimulatedActivityService],
})
export class SimulatedActivityModule {}
