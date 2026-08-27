import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CommissionPageQueryDto } from './dto/commission.dto';
import { CommissionsService } from './commissions.service';

@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async getMyCommissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommissionPageQueryDto,
  ) {
    const result = await this.commissionsService.getMyCommissions(user.id, query);

    return {
      ...result,
      events: result.events.map(
        ({ purchaserEmail: _purchaserEmail, receiverEmail: _receiverEmail, ...event }) =>
          event,
      ),
    };
  }
}
