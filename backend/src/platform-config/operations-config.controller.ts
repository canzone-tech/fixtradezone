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
import { OperationsConfigService } from './operations-config.service';
import { UpdateOperationsConfigDto } from './update-operations-config.dto';

@Controller('admin/settings/operations')
@UseGuards(SuperAdminOnlyGuard)
export class OperationsConfigController {
  constructor(
    private readonly operationsConfigService: OperationsConfigService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getOperations() {
    return this.operationsConfigService.getOperations();
  }

  @Patch()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  updateOperations(
    @Body() dto: UpdateOperationsConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.operationsConfigService.updateOperations(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
