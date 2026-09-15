import {
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
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { DepositApprovalModeService } from './deposit-approval-mode.service';
import { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';

@Controller('admin/deposits')
export class AdminDepositBlockchainVerificationController {
  constructor(
    private readonly blockchainVerification: DepositBlockchainVerificationService,
    private readonly approvalMode: DepositApprovalModeService,
    private readonly blockchainProcessing: DepositBlockchainProcessingService,
  ) {}

  @Get(':depositId/blockchain-verification')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_READ)
  async getBlockchainVerification(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
  ): Promise<unknown> {
    const [verification, approvalPolicy] = await Promise.all([
      this.blockchainVerification.getDepositVerification(depositId),
      this.approvalMode.getDepositApprovalPolicy(depositId),
    ]);

    return {
      ...verification,
      approvalPolicy,
    };
  }

  @Post(':depositId/verify-blockchain')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_REVIEW)
  verifyBlockchainTransaction(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.blockchainProcessing.verifyAndApplyPolicy(
      depositId,
      actor,
      getRequestContext(request),
    );
  }
}
