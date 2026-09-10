import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { RequestContext } from '../auth/auth.types';
import { OperationsConfigService } from '../platform-config/operations-config.service';
import { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { DepositBlockchainApprovalGuardService } from './deposit-blockchain-approval-guard.service';
import type {
  BulkApproveDepositsDto,
  ReviewDepositDto,
} from './dto/deposit.dto';
import { DepositsService } from './deposits.service';
import { DirectDepositApprovalService } from './direct-deposit-approval.service';

type DepositApprovalSource = 'MANUAL' | 'AUTO_BLOCKCHAIN';

@Injectable()
export class DepositApprovalOrchestratorService {
  private readonly logger = new Logger(DepositApprovalOrchestratorService.name);

  constructor(
    private readonly depositsService: DepositsService,
    private readonly directDepositApprovalService: DirectDepositApprovalService,
    private readonly blockchainApprovalGuard: DepositBlockchainApprovalGuardService,
    private readonly operationsConfigService: OperationsConfigService,
    private readonly walletLedgerService: WalletLedgerService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly postActivationService: SubscriptionPostActivationService,
  ) {}

  async approveDeposit(
    depositId: string,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
    approvalSource: DepositApprovalSource = 'MANUAL',
  ) {
    this.assertSuperAdmin(actor);

    const current = await this.depositsService.getDeposit(depositId);
    if (current.deposit.status !== 'APPROVED') {
      if (approvalSource === 'AUTO_BLOCKCHAIN') {
        await this.blockchainApprovalGuard.assertAutomaticApprovalAllowed(
          depositId,
        );
      } else {
        await this.blockchainApprovalGuard.assertManualApprovalAllowed(depositId);
      }
    }

    const operations = await this.operationsConfigService.getOperations();
    const postingMode =
      operations.operationsMode === 'AUTOMATIC'
        ? 'AUTO_ON_APPROVAL'
        : 'MANUAL_RECONCILIATION';

    const approval =
      current.deposit.status === 'PENDING_REVIEW'
        ? await this.directDepositApprovalService.approvePendingDeposit(
            depositId,
            dto,
            actor,
            context,
          )
        : await this.depositsService.approveDeposit(
            depositId,
            dto,
            actor,
            context,
          );

    if (operations.operationsMode === 'CONTROLLED_MANUAL') {
      return {
        ...approval,
        approvalSource,
        message:
          'Deposit approved. Downstream accounting and earnings automation are paused by Controlled Manual operations mode.',
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: false,
        packageActivated: false,
        automaticDownstreamProcessing: false,
      };
    }

    let accounting: Awaited<
      ReturnType<WalletLedgerService['reconcileApprovedDeposit']>
    >;

    try {
      accounting = await this.walletLedgerService.reconcileApprovedDeposit(
        depositId,
        actor,
        context,
      );
    } catch (error) {
      const reason = this.errorMessage(
        error,
        'Deposit accounting requires reconciliation.',
      );
      this.logger.warn(
        `Deposit ${depositId} was approved but accounting is pending: ${reason}`,
      );

      return {
        ...approval,
        approvalSource,
        message:
          'Deposit approved. Accounting and all downstream automation are pending reconciliation.',
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: false,
        accountingPendingReason: reason,
        packageActivated: false,
        automaticDownstreamProcessing: true,
      };
    }

    let activation: Awaited<
      ReturnType<SubscriptionsService['activateAutomaticallyAfterAccounting']>
    >;

    try {
      activation =
        await this.subscriptionsService.activateAutomaticallyAfterAccounting(
          depositId,
          actor,
          context,
        );
    } catch (error) {
      const reason = this.errorMessage(
        error,
        'Package activation requires reconciliation.',
      );
      this.logger.warn(
        `Deposit ${depositId} was approved/accounted but package activation is pending: ${reason}`,
      );

      return {
        ...approval,
        approvalSource,
        message:
          'Deposit approved and accounted. Package activation is pending reconciliation.',
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: true,
        ledgerTransaction: accounting.transaction,
        packageActivated: false,
        packageActivationPendingReason: reason,
        automaticDownstreamProcessing: true,
      };
    }

    if (activation.activationMode !== 'AUTO') {
      return {
        ...approval,
        approvalSource,
        message: activation.message,
        operationsMode: operations.operationsMode,
        platformTimezone: operations.platformTimezone,
        accountingPostingMode: postingMode,
        accountingPosted: true,
        ledgerTransaction: accounting.transaction,
        packageActivated: false,
        packageActivationMode: activation.activationMode,
        packageActivationTrigger: activation.activationTrigger,
        packageActivationRequired: activation.activationRequired,
        automaticDownstreamProcessing: true,
      };
    }

    const subscription = activation.subscription;
    const downstream = await this.postActivationService.process(
      subscription.id,
      actor,
      context,
    );

    return {
      ...approval,
      approvalSource,
      message: downstream.downstreamPending
        ? 'Deposit approved, accounted, and package activated. One or more downstream earnings stages remain safely recoverable.'
        : 'Deposit approved, accounted, package activated, and downstream earnings processing completed automatically.',
      operationsMode: operations.operationsMode,
      platformTimezone: operations.platformTimezone,
      accountingPostingMode: postingMode,
      accountingPosted: true,
      ledgerTransaction: accounting.transaction,
      packageActivated: true,
      packageActivationMode: activation.activationMode,
      packageActivationTrigger: activation.activationTrigger,
      packageActivationRequired: activation.activationRequired,
      subscription,
      ...downstream,
      automaticDownstreamProcessing: true,
    };
  }

  async approveDepositsBulk(
    dto: BulkApproveDepositsDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    const results: Array<{
      depositId: string;
      ok: boolean;
      message: string;
      status?: string;
      accountingPosted?: boolean;
      packageActivated?: boolean;
    }> = [];

    for (const depositId of dto.depositIds) {
      try {
        const result = await this.approveDeposit(
          depositId,
          { note: dto.note },
          actor,
          context,
        );
        results.push({
          depositId,
          ok: true,
          message: result.message,
          status: result.deposit.status,
          accountingPosted: result.accountingPosted,
          packageActivated: result.packageActivated,
        });
      } catch (error) {
        results.push({
          depositId,
          ok: false,
          message: this.errorMessage(error, 'Deposit approval failed.'),
        });
      }
    }

    const approved = results.filter((result) => result.ok).length;
    const failed = results.length - approved;

    return {
      message: `Bulk deposit approval completed: ${approved} approved, ${failed} failed.`,
      approved,
      failed,
      results,
    };
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('Only SUPER_ADMIN may approve deposits.');
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
