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
import { DepositSubmissionOrchestratorService } from './deposit-submission-orchestrator.service';
import {
  DepositPaymentRailQueryDto,
  SubmitDepositTxidDto,
  SubmitPackageDepositDto,
} from './dto/deposit.dto';
import { DepositsService } from './deposits.service';
import { PackageDepositFlowService } from './package-deposit-flow.service';

@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly depositsService: DepositsService,
    private readonly packageDepositFlowService: PackageDepositFlowService,
    private readonly depositSubmissionOrchestrator: DepositSubmissionOrchestratorService,
  ) {}

  @Get('payment-rails')
  @Header('Cache-Control', 'no-store')
  listAvailablePaymentRails(@Query() query: DepositPaymentRailQueryDto) {
    return this.depositsService.listAvailableDepositPaymentRails(query);
  }

  @Get('context/:packagePlanItemId')
  @Header('Cache-Control', 'no-store')
  getPackageDepositContext(
    @Param('packagePlanItemId', new ParseUUIDPipe()) packagePlanItemId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.packageDepositFlowService.getPackageDepositContext(
      packagePlanItemId,
      actor,
    );
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyDeposits(@CurrentUser() actor: AuthenticatedUser) {
    return this.depositsService.getMyDeposits(actor);
  }

  @Post('submit')
  @Header('Cache-Control', 'no-store')
  submitPackageDeposit(
    @Body() dto: SubmitPackageDepositDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.depositSubmissionOrchestrator.submitPackageDeposit(
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
