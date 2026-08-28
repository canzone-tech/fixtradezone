import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { OperationsConfigService } from '../platform-config/operations-config.service';
import { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import type { ReviewDepositDto } from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Injectable()
export class DepositApprovalOrchestratorService {
  private readonly logger = new Logger(DepositApprovalOrchestratorService.name);

  constructor(
    private readonly depositsService: DepositsService,
    private readonly operationsConfigService: OperationsConfigService,
    private readonly walletLedgerService: WalletLedgerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly postActivationService: SubscriptionPostActivationService,
  ) {}

  async approveDeposit(
    depositId: string,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const operations = await this.operationsConfigService.getOperations();
    const postingMode =
      operations.operationsMode === 'AUTOMATIC'
        ? 'AUTO_ON_APPROVAL'
        : 'MANUAL_RECONCILIATION';

    const approval = await this.depositsService.approveDeposit(
      depositId,
      dto,
      actor,
      context,
    );

    if (operations.operationsMode === 'CONTROLLED_MANUAL') {
      return {
        ...approval,
        message:
          'Deposit approved. Downstream accounting and earnings automation are paused by Controlled Manual operations mode.',
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: false,
        packageActivated: false,
        automaticDownstreamProcessing: false,
      };
    }

    let accounting: Awaited<
      ReturnType<WalletLedgerService['reconcileApprovedDeposit']>
    >;

    try {
      accounting = await this.walletLedgerService.reconcileApprovedDeposit(
        depositId,
        actor,
        context,
      );
    } catch (error) {
      const reason = this.errorMessage(
        error,
        'Deposit accounting requires reconciliation.',
      );
      this.logger.warn(
        `Deposit ${depositId} was approved but accounting is pending: ${reason}`,
      );

      return {
        ...approval,
        message:
          'Deposit approved. Accounting and all downstream automation are pending reconciliation.',
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: false,
        accountingPendingReason: reason,
        packageActivated: false,
        automaticDownstreamProcessing: true,
      };
    }

    let activation: Awaited<
      ReturnType<SubscriptionsService['activateAutomaticallyAfterAccounting']>
    >;

    try {
      activation =
        await this.subscriptionsService.activateAutomaticallyAfterAccounting(
          depositId,
          actor,
          context,
        );
    } catch (error) {
      const reason = this.errorMessage(
        error,
        'Package activation requires reconciliation.',
      );
      this.logger.warn(
        `Deposit ${depositId} was approved/accounted but package activation is pending: ${reason}`,
      );

      return {
        ...approval,
        message:
          'Deposit approved and accounted. Package activation is pending reconciliation.',
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: true,
        ledgerTransaction: accounting.transaction,
        packageActivated: false,
        packageActivationPendingReason: reason,
        automaticDownstreamProcessing: true,
      };
    }

    if (activation.activationMode !== 'AUTO') {
      return {
        ...approval,
        message: activation.message,
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: true,
        ledgerTransaction: accounting.transaction,
        packageActivated: false,
        packageActivationMode: activation.activationMode,
        packageActivationTrigger: activation.activationTrigger,
        packageActivationRequired: activation.activationRequired,
        automaticDownstreamProcessing: true,
      };
    }

    const subscription = activation.subscription;
    const downstream = await this.postActivationService.process(
      subscription.id,
      actor,
      context,
    );

    return {
      ...approval,
      message: downstream.downstreamPending
        ? 'Deposit approved, accounted, and package activated. One or more downstream earnings stages remain safely recoverable.'
        : 'Deposit approved, accounted, package activated, commission processed, and reward lifecycle initialized automatically.',
      operationsMode: operations.operationsMode,
      platformTimezone: operations.platformTimezone,
      accountingPostingMode: postingMode,
      accountingPosted: true,
      ledgerTransaction: accounting.transaction,
      packageActivated: true,
      packageActivationMode: activation.activationMode,
      packageActivationTrigger: activation.activationTrigger,
      packageActivationRequired: activation.activationRequired,
      subscription,
      ...downstream,
      automaticDownstreamProcessing: true,
    };
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
