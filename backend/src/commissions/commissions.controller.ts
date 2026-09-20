import { Controller, Get, Header, Query } from '@nestjs/common';
import { AllowUserImpersonation } from '../auth/allow-user-impersonation.decorator';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CommissionPageQueryDto } from './dto/commission.dto';
import { CommissionsService } from './commissions.service';

@AllowUserImpersonation()
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  async getMyCommissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommissionPageQueryDto,
  ) {
    const result = await this.commissionsService.getMyCommissions(
      user.id,
      query,
    );

    return {
      ...result,
      events: result.events.map((event) => {
        const sanitized = { ...event };
        delete sanitized.purchaserEmail;
        delete sanitized.receiverEmail;
        return sanitized;
      }),
    };
  }
}
