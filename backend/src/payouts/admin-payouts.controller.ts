import {
  Body,
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
  AdminPayoutQueryDto,
  PayoutReviewDto,
  SubmitPayoutTxidDto,
} from './dto/payout.dto';
import { PayoutsService } from './payouts.service';

@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_READ)
  list(@Query() query: AdminPayoutQueryDto) {
    return this.payoutsService.listAdminPayouts(query);
  }

  @Get(':payoutId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_READ)
  get(@Param('payoutId', new ParseUUIDPipe()) payoutId: string) {
    return this.payoutsService.getAdminPayout(payoutId);
  }

  @Post(':payoutId/approve')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_REVIEW)
  approve(
    @Param('payoutId', new ParseUUIDPipe()) payoutId: string,
    @Body() dto: PayoutReviewDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutsService.approve(
      payoutId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':payoutId/reject')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_REVIEW)
  reject(
    @Param('payoutId', new ParseUUIDPipe()) payoutId: string,
    @Body() dto: PayoutReviewDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutsService.reject(
      payoutId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':payoutId/submit')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_REVIEW)
  submit(
    @Param('payoutId', new ParseUUIDPipe()) payoutId: string,
    @Body() dto: SubmitPayoutTxidDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutsService.submitExternalTxid(
      payoutId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':payoutId/complete')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_REVIEW)
  complete(
    @Param('payoutId', new ParseUUIDPipe()) payoutId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutsService.complete(
      payoutId,
      actor,
      getRequestContext(request),
    );
  }
}
