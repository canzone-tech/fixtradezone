import { Body, Controller, Get, Header, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import {
  PurchasePackageFromTotalWalletDto,
  SubscriptionPageQueryDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';
import { TotalWalletPackagePurchaseService } from './total-wallet-package-purchase.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly totalWalletPackagePurchaseService: TotalWalletPackagePurchaseService,
  ) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMySubscriptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SubscriptionPageQueryDto,
  ) {
    return this.subscriptionsService.getMySubscriptions(user.id, query);
  }

  @Post('purchase')
  @Header('Cache-Control', 'no-store')
  purchaseFromTotalWallet(
    @Body() dto: PurchasePackageFromTotalWalletDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.totalWalletPackagePurchaseService.purchase(
      dto,
      user,
      getRequestContext(request),
    );
  }
}
