import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { getRequestContext } from '../auth/request-context';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import {
  AddSiteModeTesterDto,
  LockEmergencyRecoveryDto,
  UnlockEmergencyRecoveryDto,
  UpdateSiteModeDto,
} from './site-mode.dto';
import { SiteModeService } from './site-mode.service';

@Controller('public/site-mode')
export class PublicSiteModeController {
  constructor(private readonly siteModeService: SiteModeService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  getStatus() {
    return this.siteModeService.getPublicStatus();
  }
}

@Controller('admin/settings/site-mode')
@UseGuards(SuperAdminOnlyGuard)
export class AdminSiteModeController {
  constructor(private readonly siteModeService: SiteModeService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getStatus() {
    return this.siteModeService.getAdminStatus();
  }

  @Patch()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  update(
    @Body() dto: UpdateSiteModeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.siteModeService.updateSiteMode(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get('testers')
  @Header('Cache-Control', 'no-store')
  listTesters() {
    return this.siteModeService.listTesters();
  }

  @Post('testers')
  @Header('Cache-Control', 'no-store')
  addTester(
    @Body() dto: AddSiteModeTesterDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.siteModeService.addTester(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Delete('testers/:userId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  removeTester(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.siteModeService.removeTester(
      userId,
      actor,
      getRequestContext(request),
    );
  }

  @Post('emergency-recovery/unlock')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  unlockEmergencyRecovery(
    @Body() dto: UnlockEmergencyRecoveryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.siteModeService.unlockEmergencyRecovery(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post('emergency-recovery/lock')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  lockEmergencyRecovery(
    @Body() dto: LockEmergencyRecoveryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.siteModeService.lockEmergencyRecovery(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
