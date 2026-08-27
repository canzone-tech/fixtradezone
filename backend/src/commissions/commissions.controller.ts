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
  getMyCommissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommissionPageQueryDto,
  ) {
    return this.commissionsService.getMyCommissions(user.id, query);
  }
}
