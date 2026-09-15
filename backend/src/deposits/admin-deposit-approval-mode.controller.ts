import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { DepositApprovalModeService } from './deposit-approval-mode.service';
import { ConfigureDepositApprovalModeDto } from './dto/deposit-approval-mode.dto';

@Controller('admin/deposit-payment-rails')
export class AdminDepositApprovalModeController {
  constructor(private readonly approvalMode: DepositApprovalModeService) {}

  @Get(':railId/approval-mode')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_READ)
  getApprovalMode(
    @Param('railId', new ParseUUIDPipe()) railId: string,
  ): Promise<unknown> {
    return this.approvalMode.getRailApprovalMode(railId);
  }

  @Put(':railId/approval-mode')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSIT_ACCOUNTS_MANAGE)
  configureApprovalMode(
    @Param('railId', new ParseUUIDPipe()) railId: string,
    @Body() dto: ConfigureDepositApprovalModeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.approvalMode.configureRailApprovalMode(
      railId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
