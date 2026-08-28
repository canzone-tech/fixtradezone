import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import { RewardsService } from '../rewards/rewards.service';

@Injectable()
export class SubscriptionPostActivationService {
  private readonly logger = new Logger(SubscriptionPostActivationService.name);

  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly rewardsService: RewardsService,
  ) {}

  async process(
    subscriptionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    let referralCommission: Awaited<
      ReturnType<CommissionsService['processSubscriptionSafely']>
    > | null = null;
    let referralCommissionPendingReason: string | null = null;

    try {
      referralCommission =
        await this.commissionsService.processSubscriptionSafely(
          subscriptionId,
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
        `Package ${subscriptionId} is active but commission processing is pending: ${referralCommissionPendingReason}`,
      );
    }

    let rewardLifecycle: Awaited<
      ReturnType<RewardsService['reconcileSubscription']>
    > | null = null;
    let rewardLifecyclePendingReason: string | null = null;

    try {
      rewardLifecycle = await this.rewardsService.reconcileSubscription(
        subscriptionId,
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
        `Package ${subscriptionId} is active but reward lifecycle initialization is pending: ${rewardLifecyclePendingReason}`,
      );
    }

    return {
      referralCommission,
      referralCommissionPendingReason,
      rewardLifecycle,
      rewardLifecyclePendingReason,
      downstreamPending:
        referralCommissionPendingReason !== null ||
        rewardLifecyclePendingReason !== null,
    };
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
