import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RewardPageQueryDto } from './dto/reward.dto';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyRewards(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RewardPageQueryDto,
  ) {
    return this.rewardsService.getMyRewards(user.id, query);
  }
}
