import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletLedgerService } from './wallet-ledger.service';

@Injectable()
export class DepositAccountingRecoveryService {
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

    const packageActivation =
      await this.subscriptionsService.activateAutomaticallyAfterAccounting(
        depositId,
        actor,
        context,
      );

    if (
      packageActivation.activationMode !== 'AUTO' ||
      !packageActivation.subscription
    ) {
      return {
        ...accounting,
        packageActivation,
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
      ...downstream,
    };
  }
}
