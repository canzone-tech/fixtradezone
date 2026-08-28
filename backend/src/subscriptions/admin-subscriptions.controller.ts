import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { CommissionsService } from '../commissions/commissions.service';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { RewardsService } from '../rewards/rewards.service';
import {
  AdminSubscriptionQueryDto,
  SubscriptionPageQueryDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('admin/subscriptions')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  listSubscriptions(@Query() query: AdminSubscriptionQueryDto) {
    return this.subscriptionsService.listSubscriptions(query);
  }

  @Get('activation-pending')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_ACTIVATE)
  listActivationPending(@Query() query: SubscriptionPageQueryDto) {
    return this.subscriptionsService.listActivationPending(query);
  }

  @Get(':subscriptionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_READ)
  getSubscription(
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
  ) {
    return this.subscriptionsService.getSubscription(subscriptionId);
  }
}

@Controller('admin/deposits')
export class AdminDepositSubscriptionController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly commissionsService: CommissionsService,
    private readonly rewardsService: RewardsService,
  ) {}

  @Post(':depositId/activate-package')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_ACTIVATE)
  async activatePackage(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const context = getRequestContext(request);
    const activation = await this.subscriptionsService.reconcileActivation(
      depositId,
      actor,
      context,
    );
    const referralCommission =
      await this.commissionsService.processSubscriptionSafely(
        activation.subscription.id,
        actor,
        context,
      );

    let rewardLifecycle: Awaited<
      ReturnType<RewardsService['reconcileSubscription']>
    > | null = null;
    let rewardLifecyclePendingReason: string | null = null;

    try {
      rewardLifecycle = await this.rewardsService.reconcileSubscription(
        activation.subscription.id,
        actor,
        context,
      );
      if (rewardLifecycle.noEffectivePolicy) {
        rewardLifecyclePendingReason =
          'No published reward/cap policy applies to this subscription yet.';
      }
    } catch (error) {
      rewardLifecyclePendingReason =
        error instanceof Error
          ? error.message
          : 'Reward lifecycle requires reconciliation.';
    }

    return {
      ...activation,
      referralCommission,
      rewardLifecycle,
      rewardLifecyclePendingReason,
    };
  }
}
