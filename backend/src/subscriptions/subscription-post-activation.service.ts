import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { CommissionsService } from '../commissions/commissions.service';
import { InternalTradingLifecycleService } from '../internal-trading/internal-trading-lifecycle.service';
import { RewardsService } from '../rewards/rewards.service';

@Injectable()
export class SubscriptionPostActivationService {
  private readonly logger = new Logger(SubscriptionPostActivationService.name);

  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly rewardsService: RewardsService,
    private readonly internalTradingLifecycleService: InternalTradingLifecycleService,
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

    let internalTradingLifecycle: Awaited<
      ReturnType<
        InternalTradingLifecycleService['initializeActivatedSubscription']
      >
    > | null = null;

    let internalTradingPendingReason: string | null = null;
    let earningAuthority: 'LEGACY_REWARD' | 'INTERNAL_TRADING' | null = null;

    try {
      internalTradingLifecycle =
        await this.internalTradingLifecycleService.initializeActivatedSubscription(
          subscriptionId,
          actor,
          context,
        );

      earningAuthority = internalTradingLifecycle.earningAuthority;
    } catch (error) {
      internalTradingPendingReason = this.errorMessage(
        error,
        'Internal trading lifecycle requires reconciliation.',
      );

      this.logger.warn(
        `Package ${subscriptionId} internal trading lifecycle is pending: ${internalTradingPendingReason}`,
      );

      try {
        earningAuthority =
          await this.internalTradingLifecycleService.getEarningAuthority(
            subscriptionId,
          );
      } catch {
        earningAuthority = null;
      }
    }

    let rewardLifecycle: Awaited<
      ReturnType<RewardsService['reconcileSubscription']>
    > | null = null;

    let rewardLifecyclePendingReason: string | null = null;
    let rewardLifecycleSkippedReason: string | null = null;

    if (earningAuthority === 'INTERNAL_TRADING') {
      rewardLifecycleSkippedReason =
        'RWD-01 package reward processing skipped because INTERNAL_TRADING is the package earning authority.';
    } else if (earningAuthority === 'LEGACY_REWARD') {
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
    } else {
      rewardLifecyclePendingReason =
        'Package earning authority could not be resolved safely; reward processing was not attempted.';
    }

    return {
      referralCommission,
      referralCommissionPendingReason,

      internalTradingLifecycle,
      internalTradingPendingReason,

      rewardLifecycle,
      rewardLifecyclePendingReason,
      rewardLifecycleSkippedReason,

      downstreamPending:
        referralCommissionPendingReason !== null ||
        internalTradingPendingReason !== null ||
        rewardLifecyclePendingReason !== null,
    };
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
