import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import type { SubmitPackageDepositDto } from './dto/deposit.dto';
import { PackageDepositFlowService } from './package-deposit-flow.service';

@Injectable()
export class DepositSubmissionOrchestratorService {
  private readonly logger = new Logger(
    DepositSubmissionOrchestratorService.name,
  );

  constructor(
    private readonly packageDepositFlowService: PackageDepositFlowService,
    private readonly blockchainVerification: DepositBlockchainVerificationService,
    private readonly blockchainProcessing: DepositBlockchainProcessingService,
  ) {}

  async submitPackageDeposit(
    dto: SubmitPackageDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<unknown> {
    const submission = await this.packageDepositFlowService.submitDeposit(
      dto,
      actor,
      context,
    );

    const state = await this.blockchainVerification.getDepositVerification(
      submission.deposit.id,
    );

    if (!state.required) {
      return {
        ...submission,
        blockchainVerification: {
          required: false,
          attempted: false,
          verification: state.verification,
        },
      };
    }

    try {
      const verification = await this.blockchainProcessing.verifyAndApplyPolicy(
        submission.deposit.id,
        actor,
        context,
      );

      return {
        ...submission,
        blockchainVerification: {
          required: true,
          attempted: true,
          ...(verification as Record<string, unknown>),
        },
      };
    } catch (error) {
      const reason = this.errorMessage(error);
      this.logger.warn(
        `Automatic blockchain verification could not complete for deposit ${submission.deposit.id}: ${reason}`,
      );

      return {
        ...submission,
        blockchainVerification: {
          required: true,
          attempted: true,
          message:
            'Deposit was submitted, but automatic blockchain verification could not complete. Approval behavior remains controlled by the configured MANUAL or AUTO_AFTER_BLOCKCHAIN_VERIFIED policy.',
          verification: null,
        },
      };
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
