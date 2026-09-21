import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import type {
  SubmitDepositTxidDto,
  SubmitPackageDepositDto,
} from './dto/deposit.dto';
import { DepositsService } from './deposits.service';
import { PackageDepositFlowService } from './package-deposit-flow.service';

@Injectable()
export class DepositSubmissionOrchestratorService {
  private readonly logger = new Logger(
    DepositSubmissionOrchestratorService.name,
  );

  constructor(
    private readonly packageDepositFlowService: PackageDepositFlowService,
    private readonly depositsService: DepositsService,
    private readonly blockchainVerification: DepositBlockchainVerificationService,
    private readonly blockchainProcessing: DepositBlockchainProcessingService,
  ) {}

  submitPackageDeposit(
    dto: SubmitPackageDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<unknown> {
    return this.packageDepositFlowService.submitDeposit(dto, actor, context);
  }

  async submitDepositTxid(
    depositId: string,
    dto: SubmitDepositTxidDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<unknown> {
    const submission = await this.depositsService.submitTxid(
      depositId,
      dto,
      actor,
      context,
    );

    const state = await this.blockchainVerification.getDepositVerification(
      depositId,
    );

    if (!state.required) {
      return {
        ...submission,
        message: 'TXID submitted successfully.',
        blockchainVerification: {
          required: false,
          attempted: false,
          verification: state.verification,
        },
      };
    }

    try {
      const verification = await this.blockchainProcessing.verifyAndApplyPolicy(
        depositId,
        actor,
        context,
      );

      return {
        ...submission,
        message:
          'TXID submitted successfully. Payment verification is being processed.',
        blockchainVerification: {
          required: true,
          attempted: true,
          ...(verification as Record<string, unknown>),
        },
      };
    } catch (error) {
      const reason = this.errorMessage(error);
      this.logger.warn(
        `Automatic blockchain verification could not complete for deposit ${depositId}: ${reason}`,
      );

      return {
        ...submission,
        message:
          'TXID submitted successfully. Payment verification could not complete yet.',
        blockchainVerification: {
          required: true,
          attempted: true,
          message:
            'The transaction ID was saved, but automatic blockchain verification could not complete. Approval remains blocked until the configured verification policy is satisfied.',
          verification: null,
        },
      };
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
