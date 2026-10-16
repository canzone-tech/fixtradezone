import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AllowUserImpersonation } from '../auth/allow-user-impersonation.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { InternalTradingDailyClaimService } from './internal-trading-daily-claim.service';

@AllowUserImpersonation()
@Controller('internal-trading')
export class InternalTradingClaimsReadController {
  constructor(private readonly claims: InternalTradingDailyClaimService) {}

  @Get('me/claims')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('subscriptionId') subscriptionId?: string,
  ) {
    return this.claims.listMyClaims(
      user.id,
      page ? Number(page) : 1,
      limit ? Number(limit) : 25,
      subscriptionId,
    );
  }
}

// Financial mutation intentionally does NOT allow administrator impersonation.
@Controller('internal-trading')
export class InternalTradingClaimsWriteController {
  constructor(private readonly claims: InternalTradingDailyClaimService) {}

  @Post('me/claims/:claimId/claim')
  @Header('Cache-Control', 'no-store')
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
  ) {
    return this.claims.claim(user.id, claimId, user);
  }
}
