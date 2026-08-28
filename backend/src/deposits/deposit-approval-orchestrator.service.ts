import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import { OperationsConfigService } from '../platform-config/operations-config.service';
import { RewardsService } from '../rewards/rewards.service';
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
    private readonly commissionsService: CommissionsService,
    private readonly rewardsService: RewardsService,
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

    // From this point the package is ACTIVE. Downstream failures must never be
    // reported as an activation failure; they remain independently recoverable.
    const subscription = activation.subscription;
    let referralCommission: Awaited<
      ReturnType<CommissionsService['processSubscriptionSafely']>
    > | null = null;
    let referralCommissionPendingReason: string | null = null;

    try {
      referralCommission =
        await this.commissionsService.processSubscriptionSafely(
          subscription.id,
          actor,
          context,
        );
      if (referralCommission.processingStatus === 'PENDING_RECONCILIATION') {
        referralCommissionPendingReason = referralCommission.message;
      }
    } catch (error) {
      referralCommissionPendingReason = this.errorMessage(
        error,
        'Referral commission requires reconciliation.',
      );
      this.logger.warn(
        `Package ${subscription.id} activated but commission processing is pending: ${referralCommissionPendingReason}`,
      );
    }

    let rewardLifecycle: Awaited<
      ReturnType<RewardsService['reconcileSubscription']>
    > | null = null;
    let rewardLifecyclePendingReason: string | null = null;

    try {
      rewardLifecycle = await this.rewardsService.reconcileSubscription(
        subscription.id,
        actor,
        context,
      );
      if (rewardLifecycle.noEffectivePolicy) {
        rewardLifecyclePendingReason =
          'No published reward/cap policy applies to this subscription yet.';
      }
    } catch (error) {
      rewardLifecyclePendingReason = this.errorMessage(
        error,
        'Reward lifecycle requires reconciliation.',
      );
      this.logger.warn(
        `Package ${subscription.id} activated but reward lifecycle initialization is pending: ${rewardLifecyclePendingReason}`,
      );
    }

    const downstreamPending =
      referralCommissionPendingReason !== null ||
      rewardLifecyclePendingReason !== null;

    return {
      ...approval,
      message: downstreamPending
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
      referralCommission,
      referralCommissionPendingReason,
      rewardLifecycle,
      rewardLifecyclePendingReason,
      automaticDownstreamProcessing: true,
    };
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
