import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { DepositApprovalModeService } from './deposit-approval-mode.service';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';

interface VerificationActionResult {
  message: string;
  alreadyVerified: boolean;
  verification: {
    status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'UNAVAILABLE';
  };
}

@Injectable()
export class DepositBlockchainProcessingService {
  private readonly logger = new Logger(DepositBlockchainProcessingService.name);

  constructor(
    private readonly verification: DepositBlockchainVerificationService,
    private readonly approvalMode: DepositApprovalModeService,
    private readonly approvalOrchestrator: DepositApprovalOrchestratorService,
  ) {}

  async verifyAndApplyPolicy(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<unknown> {
    const result = (await this.verification.verifyDeposit(
      depositId,
      actor,
      context,
    )) as VerificationActionResult;

    return this.applyApprovalPolicy(depositId, result, context);
  }

  async processAutomaticCandidate(depositId: string): Promise<unknown> {
    const actor = await this.approvalMode.resolveAutomaticApprovalActor(depositId);
    const context: RequestContext = {
      userAgent: 'FixTradeZone deposit blockchain auto-approval worker',
    };

    const result = (await this.verification.verifyDeposit(
      depositId,
      actor,
      context,
    )) as VerificationActionResult;

    return this.applyApprovalPolicy(depositId, result, context, actor);
  }

  private async applyApprovalPolicy(
    depositId: string,
    verificationResult: VerificationActionResult,
    context: RequestContext,
    resolvedAutoActor?: AuthenticatedUser,
  ): Promise<unknown> {
    const policy = await this.approvalMode.getDepositApprovalPolicy(depositId);

    if (policy.approvalMode !== 'AUTO_AFTER_BLOCKCHAIN_VERIFIED') {
      return {
        ...verificationResult,
        approvalPolicy: {
          approvalMode: 'MANUAL' as const,
          automaticApprovalEnabled: false,
        },
        autoApproval: {
          attempted: false,
          approved: false,
          message: 'Manual approval mode is active.',
        },
      };
    }

    if (verificationResult.verification.status !== 'VERIFIED') {
      return {
        ...verificationResult,
        approvalPolicy: {
          approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED' as const,
          automaticApprovalEnabled: true,
        },
        autoApproval: {
          attempted: false,
          approved: false,
          message:
            'Automatic approval is waiting for blockchain verification to reach VERIFIED.',
        },
      };
    }

    try {
      const autoActor =
        resolvedAutoActor ??
        (await this.approvalMode.resolveAutomaticApprovalActor(depositId));
      const approval = await this.approvalOrchestrator.approveDeposit(
        depositId,
        {
          note: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED — on-chain payment verification passed.',
        },
        autoActor,
        context,
        'AUTO_BLOCKCHAIN',
      );

      return {
        ...verificationResult,
        message:
          'Blockchain transaction verified and automatic deposit approval was processed.',
        approvalPolicy: {
          approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED' as const,
          automaticApprovalEnabled: true,
        },
        autoApproval: {
          attempted: true,
          approved: true,
          approval,
        },
      };
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.warn(
        `Blockchain verified deposit ${depositId}, but automatic approval is pending: ${message}`,
      );
      return {
        ...verificationResult,
        message:
          'Blockchain transaction is VERIFIED, but automatic deposit approval is pending a safe retry.',
        approvalPolicy: {
          approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED' as const,
          automaticApprovalEnabled: true,
        },
        autoApproval: {
          attempted: true,
          approved: false,
          message,
        },
      };
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Automatic approval failed.';
  }
}
