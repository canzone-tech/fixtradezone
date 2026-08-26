import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { CreateDepositDto, SubmitDepositTxidDto } from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyDeposits(@CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.getMyDeposits(actor);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  createDeposit(
    @Body() dto: CreateDepositDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.createDeposit(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':depositId/txid')
  @Header('Cache-Control', 'no-store')
  submitTxid(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @Body() dto: SubmitDepositTxidDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositsService.submitTxid(
      depositId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
