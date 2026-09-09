import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminDepositAccountsController } from './admin-deposit-accounts.controller';
import { AdminDepositPackageAccountsController } from './admin-deposit-package-accounts.controller';
import { AdminDepositPaymentRailsController } from './admin-deposit-payment-rails.controller';
import { AdminDepositsController } from './admin-deposits.controller';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import { DepositPackageRoutingService } from './deposit-package-routing.service';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { DirectDepositApprovalService } from './direct-deposit-approval.service';
import { PackageDepositFlowService } from './package-deposit-flow.service';

@Module({
  imports: [
    WalletModule,
    PlatformConfigModule,
    SubscriptionsModule,
    CommissionsModule,
    RewardsModule,
  ],
  controllers: [
    DepositsController,
    AdminDepositPaymentRailsController,
    AdminDepositAccountsController,
    AdminDepositPackageAccountsController,
    AdminDepositsController,
  ],
  providers: [
    DepositsService,
    PackageDepositFlowService,
    DepositPackageRoutingService,
    DirectDepositApprovalService,
    DepositApprovalOrchestratorService,
  ],
  exports: [DepositsService],
})
export class DepositsModule {}
