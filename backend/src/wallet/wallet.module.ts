import { Module } from '@nestjs/common';
import { CommissionsModule } from '../commissions/commissions.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import {
  AdminDepositAccountingController,
  AdminLedgerController,
} from './admin-ledger.controller';
import { AdminWalletsController } from './admin-wallets.controller';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [SubscriptionsModule, CommissionsModule],
  controllers: [
    WalletController,
    AdminWalletsController,
    AdminLedgerController,
    AdminDepositAccountingController,
  ],
  providers: [WalletLedgerService],
  exports: [WalletLedgerService],
})
export class WalletModule {}
