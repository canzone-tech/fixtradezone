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
import { getRequestContext } from '../auth/request-context';
import {
  CreateDepositDto,
  DepositPaymentRailQueryDto,
  EnsureDepositAddressAssignmentDto,
  SubmitDepositRequestDto,
  SubmitDepositTxidDto,
} from './dto/deposit.dto';
import { DepositsService } from './deposits.service';
import { PermanentDepositFlowService } from './permanent-deposit-flow.service';

@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
    private readonly permanentDepositFlowService: PermanentDepositFlowService,
  ) {}

  @Get('payment-rails')
  @Header('Cache-Control', 'no-store')
  listAvailablePaymentRails(@Query() query: DepositPaymentRailQueryDto) {
    return this.depositsService.listAvailableDepositPaymentRails(query);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyDeposits(@CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.getMyDeposits(actor);
  }

  @Post('address-assignment')
  @Header('Cache-Control', 'no-store')
  ensureAddressAssignment(
    @Body() dto: EnsureDepositAddressAssignmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.permanentDepositFlowService.ensureAddressAssignment(
      dto.paymentRailId,
      actor,
      getRequestContext(request),
    );
  }

  @Post('submit')
  @Header('Cache-Control', 'no-store')
  submitDeposit(
    @Body() dto: SubmitDepositRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.permanentDepositFlowService.submitDeposit(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  createDeposit(
    @Body() dto: CreateDepositDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.permanentDepositFlowService.createDeposit(
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
