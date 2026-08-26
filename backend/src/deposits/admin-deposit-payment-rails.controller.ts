import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import {
  CreateDepositPaymentRailDto,
  DepositPaymentRailQueryDto,
  UpdateDepositPaymentRailDto,
} from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Controller('admin/deposit-payment-rails')
export class AdminDepositPaymentRailsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_READ)
  listPaymentRails(@Query() query: DepositPaymentRailQueryDto) {
    return this.depositsService.listDepositPaymentRails(query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  createPaymentRail(
    @Body() dto: CreateDepositPaymentRailDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.createDepositPaymentRail(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':railId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  updatePaymentRail(
    @Param('railId', new ParseUUIDPipe()) railId: string,
    @Body() dto: UpdateDepositPaymentRailDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.updateDepositPaymentRail(
      railId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
