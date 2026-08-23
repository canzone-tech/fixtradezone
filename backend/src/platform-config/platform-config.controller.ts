import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import { PlatformConfigService } from './platform-config.service';
import { UpdateAuthenticationConfigDto } from './update-authentication-config.dto';
import { UpdateRegistrationConfigDto } from './update-registration-config.dto';

@Controller('admin/settings')
@UseGuards(SuperAdminOnlyGuard)
export class PlatformConfigController {
  constructor(private readonly platformConfigService: PlatformConfigService) {}

  @Get('authentication')
  @Header('Cache-Control', 'no-store')
  getAuthentication() {
    return this.platformConfigService.getAuthentication();
  }

  @Patch('authentication')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  updateAuthentication(
    @Body() dto: UpdateAuthenticationConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.platformConfigService.updateAuthentication(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get('registration')
  @Header('Cache-Control', 'no-store')
  getRegistration() {
    return this.platformConfigService.getRegistration();
  }

  @Patch('registration')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  updateRegistration(
    @Body() dto: UpdateRegistrationConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.platformConfigService.updateRegistration(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
