import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { AccountingConfigService } from '../platform-config/accounting-config.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import type { ReviewDepositDto } from './dto/deposit.dto';
import { DepositsService } from './deposits.service';

@Injectable()
export class DepositApprovalOrchestratorService {
  private readonly logger = new Logger(DepositApprovalOrchestratorService.name);

  constructor(
    private readonly depositsService: DepositsService,
    private readonly accountingConfigService: AccountingConfigService,
    private readonly walletLedgerService: WalletLedgerService,
    private readonly subscriptionsService: SubscriptionsService,
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
          'Deposit approved. Accounting and package activation are waiting for reconciliation by policy.',
        accountingPostingMode: postingMode,
        accountingPosted: false,
        packageActivated: false,
      };
    }

    const accounting = await this.walletLedgerService.reconcileApprovedDeposit(
      depositId,
      actor,
      context,
    );

    try {
      const activation =
        await this.subscriptionsService.activateFromApprovedDeposit(
          depositId,
          actor,
          context,
        );

      return {
        ...approval,
        message:
          'Deposit approved, accounted, and package activation completed.',
        accountingPostingMode: postingMode,
        accountingPosted: true,
        ledgerTransaction: accounting.transaction,
        packageActivated: true,
        subscription: activation.subscription,
      };
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Package activation requires reconciliation.';
      this.logger.warn(
        `Deposit ${depositId} was approved/accounted but package activation is pending: ${reason}`,
      );

      return {
        ...approval,
        message:
          'Deposit approved and accounted. Package activation is pending reconciliation.',
        accountingPostingMode: postingMode,
        accountingPosted: true,
        ledgerTransaction: accounting.transaction,
        packageActivated: false,
        packageActivationPendingReason: reason,
      };
    }
  }
}
