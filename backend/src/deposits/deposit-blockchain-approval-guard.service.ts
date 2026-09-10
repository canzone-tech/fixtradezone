import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { DepositBlockchainVerificationStatus } from './deposit-blockchain-verification.service';
import type { DepositApprovalMode } from './dto/deposit-approval-mode.dto';

type VerificationMode = 'OFF' | 'VERIFY_ONLY';

interface ApprovalGuardRow {
  depositId: string;
  depositStatus: string;
  approvalMode: DepositApprovalMode | null;
  verificationMode: VerificationMode | null;
  verificationStatus: DepositBlockchainVerificationStatus | null;
  failureCode: string | null;
  failureReason: string | null;
}

@Injectable()
export class DepositBlockchainApprovalGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertManualApprovalAllowed(depositId: string) {
    const row = await this.load(depositId);

    if (row.depositStatus === 'APPROVED') {
      return {
        approvalMode: row.approvalMode ?? ('MANUAL' as const),
        allowed: true,
        historicalApproved: true,
        verificationStatus: row.verificationStatus,
      };
    }

    const approvalMode = row.approvalMode ?? 'MANUAL';
    if (approvalMode !== 'MANUAL') {
      throw new ConflictException(
        'Automatic blockchain approval mode is enabled for this payment rail. Manual approval is disabled; the system will approve only after blockchain verification reaches VERIFIED.',
      );
    }

    return {
      approvalMode,
      allowed: true,
      historicalApproved: false,
      verificationStatus: row.verificationStatus,
    };
  }

  async assertAutomaticApprovalAllowed(depositId: string) {
    const row = await this.load(depositId);

    if (row.depositStatus === 'APPROVED') {
      return {
        approvalMode: row.approvalMode ?? ('MANUAL' as const),
        allowed: true,
        historicalApproved: true,
        verificationStatus: row.verificationStatus,
      };
    }

    if (row.approvalMode !== 'AUTO_AFTER_BLOCKCHAIN_VERIFIED') {
      throw new ConflictException(
        'Automatic blockchain approval is not enabled for this payment rail.',
      );
    }
    if (row.verificationMode !== 'VERIFY_ONLY') {
      throw new ConflictException(
        'Automatic blockchain approval requires blockchain verification to be enabled.',
      );
    }
    if (row.verificationStatus !== 'VERIFIED') {
      throw new ConflictException(this.blockMessage(row));
    }

    return {
      approvalMode: row.approvalMode,
      allowed: true,
      historicalApproved: false,
      verificationStatus: row.verificationStatus,
    };
  }

  private async load(depositId: string): Promise<ApprovalGuardRow> {
    const rows = await this.prisma.$queryRaw<ApprovalGuardRow[]>(Prisma.sql`
      SELECT
        d.id AS depositId,
        d.status AS depositStatus,
        approval.approvalMode AS approvalMode,
        cfg.verificationMode AS verificationMode,
        verification.status AS verificationStatus,
        verification.failureCode AS failureCode,
        verification.failureReason AS failureReason
      FROM deposits d
      LEFT JOIN deposit_accounts account
        ON account.id = d.assignedDepositAccountId
      LEFT JOIN deposit_payment_rail_approval_configs approval
        ON approval.paymentRailId = account.paymentRailId
      LEFT JOIN deposit_payment_rail_blockchain_configs cfg
        ON cfg.paymentRailId = account.paymentRailId
      LEFT JOIN deposit_blockchain_verifications verification
        ON verification.depositId = d.id
      WHERE d.id = ${depositId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) throw new NotFoundException('Deposit was not found.');
    return row;
  }

  private blockMessage(row: ApprovalGuardRow): string {
    switch (row.verificationStatus) {
      case 'PENDING':
        return 'Blockchain verification is pending. Automatic approval will wait until the transaction is mined and reaches the required confirmations.';
      case 'FAILED':
        return `Blockchain verification failed${row.failureCode ? ` (${row.failureCode})` : ''}. Automatic approval is blocked; reject or investigate this deposit.`;
      case 'UNAVAILABLE':
        return 'Blockchain verification is temporarily unavailable. Automatic approval will retry later.';
      default:
        return 'Blockchain verification must reach VERIFIED before automatic approval.';
    }
  }
}
