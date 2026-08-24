import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ListDirectReferralsQueryDto } from './dto/list-direct-referrals-query.dto';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.referralsService.getMine(user);
  }

  @Get('me/direct')
  @Header('Cache-Control', 'no-store')
  listMineDirect(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDirectReferralsQueryDto,
  ) {
    return this.referralsService.listMineDirect(user, query);
  }
}
