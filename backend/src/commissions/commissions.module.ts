import { Module } from '@nestjs/common';
import {
  AdminCommissionPlansController,
  AdminCommissionsController,
  AdminSubscriptionCommissionController,
} from './admin-commissions.controller';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
  controllers: [
    CommissionsController,
    AdminCommissionPlansController,
    AdminCommissionsController,
    AdminSubscriptionCommissionController,
  ],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
