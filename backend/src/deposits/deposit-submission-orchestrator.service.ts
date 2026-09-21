import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
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
    let submission: Awaited<
      ReturnType<PackageDepositFlowService['submitDeposit']>
    >;

    try {
      submission = await this.packageDepositFlowService.submitDeposit(
        dto,
        actor,
        context,
      );
    } catch (error) {
      this.rethrowSubmissionConflict(error);
    }

    const state = await this.blockchainVerification.getDepositVerification(
      submission.deposit.id,
    );

    if (!state.required) {
      return {
        ...submission,
        message: 'Deposit submitted successfully.',
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
        message:
          'Deposit submitted successfully. Payment verification is being processed.',
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
        message:
          'Deposit submitted successfully. Payment verification could not complete yet.',
        blockchainVerification: {
          required: true,
          attempted: true,
          message:
            'The transaction ID was saved, but blockchain verification could not complete. Approval remains blocked until the configured verification requirement reaches VERIFIED.',
          verification: null,
        },
      };
    }
  }

  private rethrowSubmissionConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const metadata = JSON.stringify(error.meta ?? {});

      if (metadata.includes('txid')) {
        throw new ConflictException(
          'This transaction ID has already been submitted on this network.',
        );
      }

      if (metadata.includes('openKey')) {
        throw new ConflictException(
          'An open deposit already exists for this user.',
        );
      }
    }

    throw error;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
