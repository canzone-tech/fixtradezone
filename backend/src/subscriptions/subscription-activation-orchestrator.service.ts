import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { SubscriptionPostActivationService } from './subscription-post-activation.service';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionActivationOrchestratorService {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly postActivationService: SubscriptionPostActivationService,
  ) {}

  async reconcileActivation(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const activation = await this.subscriptionsService.reconcileActivation(
      depositId,
      actor,
      context,
    );
    const downstream = await this.postActivationService.process(
      activation.subscription.id,
      actor,
      context,
    );

    return {
      ...activation,
      ...downstream,
      message: downstream.downstreamPending
        ? 'Package activation completed. One or more downstream earnings stages remain safely recoverable.'
        : 'Package activation, commission processing, and reward lifecycle initialization completed.',
    };
  }
}
