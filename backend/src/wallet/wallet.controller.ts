import { Controller, Get, Header, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { WalletPageQueryDto } from './dto/wallet.dto';
import { WalletLedgerService } from './wallet-ledger.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletLedgerService: WalletLedgerService) {}

  @Get('me')
  @Header('Cache-Control', 'no-store')
  getMyWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WalletPageQueryDto,
  ) {
    return this.walletLedgerService.getMyWallet(user.id, query);
  }
}
