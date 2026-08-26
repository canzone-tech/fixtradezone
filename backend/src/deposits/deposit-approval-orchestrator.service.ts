import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { AccountingConfigService } from '../platform-config/accounting-config.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import type { ReviewDepositDto } from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Injectable()
export class DepositApprovalOrchestratorService {
  constructor(
    private readonly depositsService: DepositsService,
    private readonly accountingConfigService: AccountingConfigService,
    private readonly walletLedgerService: WalletLedgerService,
  ) {}

  async approveDeposit(
    depositId: string,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const postingMode =
      await this.accountingConfigService.getDepositPostingMode();

    const approval = await this.depositsService.approveDeposit(
      depositId,
      dto,
      actor,
      context,
    );

    if (postingMode === 'MANUAL_RECONCILIATION') {
      return {
        ...approval,
        message:
          'Deposit approved. Accounting is waiting for manual reconciliation by policy.',
        accountingPostingMode: postingMode,
        accountingPosted: false,
      };
    }

    const accounting = await this.walletLedgerService.reconcileApprovedDeposit(
      depositId,
      actor,
      context,
    );

    return {
      ...approval,
      message: 'Deposit approved and credited to Main / Deposit Balance.',
      accountingPostingMode: postingMode,
      accountingPosted: true,
      ledgerTransaction: accounting.transaction,
    };
  }
}
