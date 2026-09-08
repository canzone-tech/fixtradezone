import { Controller, Get, Header } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AwardRewardsService } from './award-rewards.service';

@Controller('award-rewards')
export class AwardRewardsController {
  constructor(private readonly awardRewardsService: AwardRewardsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.awardRewardsService.getMyAwards(user.id);
  }
}
