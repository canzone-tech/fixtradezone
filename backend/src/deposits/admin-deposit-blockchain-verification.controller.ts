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
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';

@Controller('admin/deposits')
export class AdminDepositBlockchainVerificationController {
  constructor(
    private readonly blockchainVerification: DepositBlockchainVerificationService,
  ) {}

  @Get(':depositId/blockchain-verification')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_READ)
  getBlockchainVerification(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
  ) {
    return this.blockchainVerification.getDepositVerification(depositId);
  }

  @Post(':depositId/verify-blockchain')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_REVIEW)
  verifyBlockchainTransaction(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.blockchainVerification.verifyDeposit(
      depositId,
      actor,
      getRequestContext(request),
    );
  }
}
