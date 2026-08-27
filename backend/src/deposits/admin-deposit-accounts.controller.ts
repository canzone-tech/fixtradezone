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
import {
  CreateDepositAccountDto,
  UpdateDepositAccountDto,
} from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Controller('admin/deposit-accounts')
export class AdminDepositAccountsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_READ)
  listDepositAccounts() {
    return this.depositsService.listDepositAccounts();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  createDepositAccount(
    @Body() dto: CreateDepositAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.createDepositAccount(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':accountId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  updateDepositAccount(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Body() dto: UpdateDepositAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.updateDepositAccount(
      accountId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
