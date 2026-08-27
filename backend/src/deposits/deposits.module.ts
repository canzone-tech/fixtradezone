import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminDepositAccountsController } from './admin-deposit-accounts.controller';
import { AdminDepositPaymentRailsController } from './admin-deposit-payment-rails.controller';
import { AdminDepositsController } from './admin-deposits.controller';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  imports: [
    WalletModule,
    PlatformConfigModule,
    SubscriptionsModule,
    CommissionsModule,
  ],
  controllers: [
    DepositsController,
    AdminDepositPaymentRailsController,
    AdminDepositAccountsController,
    AdminDepositsController,
  ],
  providers: [DepositsService, DepositApprovalOrchestratorService],
  exports: [DepositsService],
})
export class DepositsModule {}
