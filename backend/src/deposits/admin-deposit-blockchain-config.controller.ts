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
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import { ConfigureDepositBlockchainVerificationDto } from './dto/deposit-blockchain.dto';

@Controller('admin/deposit-payment-rails')
export class AdminDepositBlockchainConfigController {
  constructor(
    private readonly blockchainVerification: DepositBlockchainVerificationService,
  ) {}

  @Get(':railId/blockchain-config')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_ACCOUNTS_READ)
  getBlockchainConfig(@Param('railId', new ParseUUIDPipe()) railId: string) {
    return this.blockchainVerification.getRailConfig(railId);
  }

  @Put(':railId/blockchain-config')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.DEPOSITS_ACCOUNTS_MANAGE)
  configureBlockchainVerification(
    @Param('railId', new ParseUUIDPipe()) railId: string,
    @Body() dto: ConfigureDepositBlockchainVerificationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.blockchainVerification.configureRail(
      railId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
