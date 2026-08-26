import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import { AdminDepositQueryDto, ReviewDepositDto } from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Controller('admin/deposits')
export class AdminDepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_READ)
  listDeposits(@Query() query: AdminDepositQueryDto) {
    return this.depositsService.listDeposits(query);
  }

  @Get(':depositId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_READ)
  getDeposit(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
  ) {
    return this.depositsService.getDeposit(depositId);
  }

  @Post(':depositId/approve')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_REVIEW)
  approveDeposit(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @Body() dto: ReviewDepositDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.approveDeposit(
      depositId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':depositId/reject')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_REVIEW)
  rejectDeposit(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @Body() dto: ReviewDepositDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.rejectDeposit(
      depositId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
