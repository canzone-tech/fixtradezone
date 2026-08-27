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
import { AccountingConfigService } from './accounting-config.service';
import { UpdateAccountingConfigDto } from './update-accounting-config.dto';

@Controller('admin/settings/accounting')
@UseGuards(SuperAdminOnlyGuard)
export class AccountingConfigController {
  constructor(
    private readonly accountingConfigService: AccountingConfigService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getAccounting() {
    return this.accountingConfigService.getAccounting();
  }

  @Patch()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  updateAccounting(
    @Body() dto: UpdateAccountingConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.accountingConfigService.updateAccounting(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
