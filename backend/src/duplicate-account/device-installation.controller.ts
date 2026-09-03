import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { ObserveDeviceInstallationDto } from './dto/observe-device-installation.dto';
import { DuplicateAccountService } from './duplicate-account.service';

@Controller('auth/device-installation')
export class DeviceInstallationController {
  constructor(private readonly service: DuplicateAccountService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  observe(
    @Body() dto: ObserveDeviceInstallationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.observeAuthenticatedDevice(
      user,
      dto.deviceInstallationId,
      getRequestContext(request),
    );
  }
}
