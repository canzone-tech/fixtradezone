import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { DepositPackageRoutingService } from './deposit-package-routing.service';
import {
  ConfigureDepositPackageAccountDto,
  CreatePackageDepositAccountDto,
} from './dto/deposit.dto';

@Controller('admin/deposit-package-accounts')
export class AdminDepositPackageAccountsController {
  constructor(
    private readonly depositPackageRoutingService: DepositPackageRoutingService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_READ)
  listPackageRoutes() {
    return this.depositPackageRoutingService.listPackageRoutes();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  createPackageAccount(
    @Body() dto: CreatePackageDepositAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositPackageRoutingService.createPackageAccount(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':packageDefinitionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  configurePackageRoute(
    @Param('packageDefinitionId', new ParseUUIDPipe()) packageDefinitionId: string,
    @Body() dto: ConfigureDepositPackageAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositPackageRoutingService.configurePackageRoute(
      packageDefinitionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
