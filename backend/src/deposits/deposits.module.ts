import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { RewardsModule } from '../rewards/rewards.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminDepositAccountsController } from './admin-deposit-accounts.controller';
import { AdminDepositApprovalModeController } from './admin-deposit-approval-mode.controller';
import { AdminDepositBlockchainConfigController } from './admin-deposit-blockchain-config.controller';
import { AdminDepositBlockchainVerificationController } from './admin-deposit-blockchain-verification.controller';
import { AdminDepositPackageAccountsController } from './admin-deposit-package-accounts.controller';
import { AdminDepositPaymentRailsController } from './admin-deposit-payment-rails.controller';
import { AdminDepositsController } from './admin-deposits.controller';
import { DepositApprovalModeService } from './deposit-approval-mode.service';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import { DepositBlockchainApprovalGuardService } from './deposit-blockchain-approval-guard.service';
import { DepositBlockchainAutoApprovalWorker } from './deposit-blockchain-auto-approval.worker';
import { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import { DepositPackageRoutingService } from './deposit-package-routing.service';
import { DepositSubmissionOrchestratorService } from './deposit-submission-orchestrator.service';
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
    AdminDepositBlockchainConfigController,
    AdminDepositApprovalModeController,
    AdminDepositAccountsController,
    AdminDepositPackageAccountsController,
    AdminDepositsController,
    AdminDepositBlockchainVerificationController,
  ],
  providers: [
    DepositsService,
    PackageDepositFlowService,
    DepositPackageRoutingService,
    DepositBlockchainVerificationService,
    DepositApprovalModeService,
    DepositBlockchainApprovalGuardService,
    DepositBlockchainProcessingService,
    DepositSubmissionOrchestratorService,
    DirectDepositApprovalService,
    DepositApprovalOrchestratorService,
    DepositBlockchainAutoApprovalWorker,
  ],
  exports: [
    DepositsService,
    DepositBlockchainVerificationService,
    DepositApprovalModeService,
  ],
})
export class DepositsModule {}
