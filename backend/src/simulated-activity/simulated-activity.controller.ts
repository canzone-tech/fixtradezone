import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { SimulatedActivityPageQueryDto } from './dto/simulated-activity.dto';
import { SimulatedActivityService } from './simulated-activity.service';

@Controller('simulated-activity')
export class SimulatedActivityController {
  constructor(private readonly service: SimulatedActivityService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SimulatedActivityPageQueryDto,
  ) {
    return this.service.getMyActivity(user.id, query);
  }
}
