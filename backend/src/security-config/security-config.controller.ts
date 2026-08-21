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
import { SecurityConfigService } from './security-config.service';
import { SuperAdminOnlyGuard } from './super-admin-only.guard';
import { UpdateSecurityConfigDto } from './update-security-config.dto';

@Controller('admin/settings/security')
@UseGuards(SuperAdminOnlyGuard)
export class SecurityConfigController {
  constructor(private readonly securityConfigService: SecurityConfigService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    return this.securityConfigService.get();
  }

  @Patch()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  update(
    @Body()
    dto: UpdateSecurityConfigDto,
    @CurrentUser()
    actor: AuthenticatedUser,
    @Req()
    request: Request,
  ) {
    return this.securityConfigService.update(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
