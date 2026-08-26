import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { AdminWalletQueryDto, WalletPageQueryDto } from './dto/wallet.dto';
import { WalletLedgerService } from './wallet-ledger.service';

@Controller('admin/wallets')
export class AdminWalletsController {
  constructor(private readonly walletLedgerService: WalletLedgerService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.WALLETS_READ)
  listWallets(@Query() query: AdminWalletQueryDto) {
    return this.walletLedgerService.listWallets(query);
  }

  @Get('reconciliation')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.LEDGER_POST)
  listUnpostedApprovedDeposits(@Query() query: WalletPageQueryDto) {
    return this.walletLedgerService.listUnpostedApprovedDeposits(query);
  }
}
