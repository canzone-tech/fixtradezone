import { Module } from '@nestjs/common';
import { AdminDepositAccountsController } from './admin-deposit-accounts.controller';
import { AdminDepositsController } from './admin-deposits.controller';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';

@Module({
  controllers: [
    DepositsController,
    AdminDepositAccountsController,
    AdminDepositsController,
  ],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
