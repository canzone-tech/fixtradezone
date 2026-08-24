import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import { UpdateReferralConfigDto } from './dto/update-referral-config.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';
import { ReferralsService } from './referrals.service';

@Controller('admin/referrals')
export class AdminReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  getConfig() {
    return this.referralsService.getConfig();
  }

  @Patch('config')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  updateConfig(
    @Body() dto: UpdateReferralConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.referralsService.updateConfig(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':userId/sponsor')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REFERRALS_SPONSOR_MANAGE)
  updateSponsor(
    @Param('userId') userId: string,
    @Body() dto: UpdateSponsorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.referralsService.assignSponsor(
      userId,
      dto.sponsorUserId,
      dto.reason,
      actor,
      getRequestContext(request),
    );
  }
}
