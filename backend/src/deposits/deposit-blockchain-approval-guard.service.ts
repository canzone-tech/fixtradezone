import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { DepositBlockchainVerificationStatus } from './deposit-blockchain-verification.service';

type VerificationMode = 'OFF' | 'VERIFY_ONLY';

interface ApprovalGuardRow {
  depositId: string;
  depositStatus: string;
  verificationMode: VerificationMode | null;
  verificationStatus: DepositBlockchainVerificationStatus | null;
  failureCode: string | null;
  failureReason: string | null;
}

@Injectable()
export class DepositBlockchainApprovalGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertApprovalAllowed(depositId: string) {
    const rows = await this.prisma.$queryRaw<ApprovalGuardRow[]>(Prisma.sql`
      SELECT
        d.id AS depositId,
        d.status AS depositStatus,
        cfg.verificationMode AS verificationMode,
        verification.status AS verificationStatus,
        verification.failureCode AS failureCode,
        verification.failureReason AS failureReason
      FROM deposits d
      LEFT JOIN deposit_accounts account
        ON account.id = d.assignedDepositAccountId
      LEFT JOIN deposit_payment_rail_blockchain_configs cfg
        ON cfg.paymentRailId = account.paymentRailId
      LEFT JOIN deposit_blockchain_verifications verification
        ON verification.depositId = d.id
      WHERE d.id = ${depositId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Deposit was not found.');
    }

    if (row.depositStatus === 'APPROVED') {
      return {
        required: row.verificationMode === 'VERIFY_ONLY',
        allowed: true,
        historicalApproved: true,
        verificationStatus: row.verificationStatus,
      };
    }

    if (row.verificationMode !== 'VERIFY_ONLY') {
      return {
        required: false,
        allowed: true,
        historicalApproved: false,
        verificationStatus: row.verificationStatus,
      };
    }

    if (row.verificationStatus === 'VERIFIED') {
      return {
        required: true,
        allowed: true,
        historicalApproved: false,
        verificationStatus: row.verificationStatus,
      };
    }

    throw new ConflictException(this.blockMessage(row));
  }

  private blockMessage(row: ApprovalGuardRow): string {
    switch (row.verificationStatus) {
      case 'PENDING':
        return 'Blockchain verification is pending. Retry verification after the transaction is mined and reaches the required confirmations before approval.';
      case 'FAILED':
        return `Blockchain verification failed${row.failureCode ? ` (${row.failureCode})` : ''}. Reject or investigate this deposit; approval is blocked.`;
      case 'UNAVAILABLE':
        return 'Blockchain verification is temporarily unavailable. Retry verification before approval.';
      default:
        return 'Blockchain verification is required and must be VERIFIED before approval.';
    }
  }
}
