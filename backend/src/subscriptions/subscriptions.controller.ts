import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { SubscriptionPageQueryDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMySubscriptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SubscriptionPageQueryDto,
  ) {
    return this.subscriptionsService.getMySubscriptions(user.id, query);
  }
}
