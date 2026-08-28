import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletLedgerService } from './wallet-ledger.service';

@Injectable()
export class DepositAccountingRecoveryService {
  private readonly logger = new Logger(DepositAccountingRecoveryService.name);

  constructor(
    private readonly walletLedgerService: WalletLedgerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly postActivationService: SubscriptionPostActivationService,
  ) {}

  async reconcileApprovedDeposit(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const accounting = await this.walletLedgerService.reconcileApprovedDeposit(
      depositId,
      actor,
      context,
    );

    let packageActivation: Awaited<
      ReturnType<SubscriptionsService['activateAutomaticallyAfterAccounting']>
    >;

    try {
      packageActivation =
        await this.subscriptionsService.activateAutomaticallyAfterAccounting(
          depositId,
          actor,
          context,
        );
    } catch (error) {
      const packageActivationPendingReason =
        error instanceof Error
          ? error.message
          : 'Package activation requires reconciliation.';
      this.logger.warn(
        `Deposit ${depositId} accounting is posted but package activation is pending: ${packageActivationPendingReason}`,
      );

      return {
        ...accounting,
        packageActivation: null,
        packageActivationPendingReason,
        referralCommission: null,
        referralCommissionPendingReason: null,
        rewardLifecycle: null,
        rewardLifecyclePendingReason: null,
        downstreamPending: true,
      };
    }

    if (
      packageActivation.activationMode !== 'AUTO' ||
      !packageActivation.subscription
    ) {
      return {
        ...accounting,
        packageActivation,
        packageActivationPendingReason: null,
        referralCommission: null,
        referralCommissionPendingReason: null,
        rewardLifecycle: null,
        rewardLifecyclePendingReason: null,
        downstreamPending: false,
      };
    }

    const downstream = await this.postActivationService.process(
      packageActivation.subscription.id,
      actor,
      context,
    );

    return {
      ...accounting,
      packageActivation,
      packageActivationPendingReason: null,
      ...downstream,
    };
  }
}
