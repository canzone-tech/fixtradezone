import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import type { SubmitPackageDepositDto } from './dto/deposit.dto';
import { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import { PackageDepositFlowService } from './package-deposit-flow.service';

@Injectable()
export class DepositSubmissionOrchestratorService {
  private readonly logger = new Logger(
    DepositSubmissionOrchestratorService.name,
  );

  constructor(
    private readonly packageDepositFlowService: PackageDepositFlowService,
    private readonly blockchainVerification: DepositBlockchainVerificationService,
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
      const verification = await this.blockchainVerification.verifyDeposit(
        submission.deposit.id,
        actor,
        context,
      );

      return {
        ...submission,
        blockchainVerification: {
          required: true,
          attempted: true,
          ...verification,
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
            'Deposit was submitted, but automatic blockchain verification could not complete. Approval remains blocked until verification is retried successfully.',
          verification: null,
        },
      };
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
