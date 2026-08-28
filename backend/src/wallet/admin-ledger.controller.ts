import {
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
import { DepositAccountingRecoveryService } from './deposit-accounting-recovery.service';
import { AdminLedgerQueryDto } from './dto/wallet.dto';
import { WalletLedgerService } from './wallet-ledger.service';

@Controller('admin/ledger')
export class AdminLedgerController {
  constructor(private readonly walletLedgerService: WalletLedgerService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_READ)
  listLedger(@Query() query: AdminLedgerQueryDto) {
    return this.walletLedgerService.listLedger(query);
  }

  @Get(':transactionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_READ)
  getLedgerTransaction(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ) {
    return this.walletLedgerService.getLedgerTransaction(transactionId);
  }
}

@Controller('admin/deposits')
export class AdminDepositAccountingController {
  constructor(
    private readonly accountingRecoveryService: DepositAccountingRecoveryService,
  ) {}

  @Post(':depositId/post-accounting')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_POST)
  postApprovedDeposit(
    @Param('depositId', new ParseUUIDPipe()) depositId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.accountingRecoveryService.reconcileApprovedDeposit(
      depositId,
      actor,
      getRequestContext(request),
    );
  }
}
