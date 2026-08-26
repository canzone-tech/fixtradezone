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
import { PERMISSIONS } from '../rbac/rbac.constants';
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
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post(':depositId/activate-package')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTIONS_ACTIVATE)
  activatePackage(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.subscriptionsService.reconcileActivation(
      depositId,
      actor,
      getRequestContext(request),
    );
  }
}
