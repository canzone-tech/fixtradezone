import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import {
  CreatePayoutDto,
  PayoutPageQueryDto,
} from './dto/payout.dto';
import { PayoutPolicyService } from './payout-policy.service';
import { PayoutsService } from './payouts.service';

@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly payoutPolicyService: PayoutPolicyService,
  ) {}

  @Get('policy')
  @Header('Cache-Control', 'no-store')
  getCurrentPolicy() {
    return this.payoutPolicyService.getCurrentPolicy();
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyPayouts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PayoutPageQueryDto,
  ) {
    return this.payoutsService.getMyPayouts(actor.id, query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  createRequest(
    @Body() dto: CreatePayoutDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutsService.createRequest(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
