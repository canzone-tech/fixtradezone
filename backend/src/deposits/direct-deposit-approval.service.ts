import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ReviewDepositDto } from './dto/deposit.dto';
import { DEPOSIT_AUDIT_OPERATIONS } from './deposits.constants';
import { DepositsService } from './deposits.service';

@Injectable()
export class DirectDepositApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly depositsService: DepositsService,
  ) {}

  async approvePendingDeposit(
    depositId: string,
    dto: ReviewDepositDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const before = await transaction.deposit.findUnique({
            where: { id: depositId },
            select: {
              id: true,
              userId: true,
              status: true,
              txid: true,
              amount: true,
              currency: true,
              assignedDepositAccountId: true,
              assignedWalletAddress: true,
              assignedNetwork: true,
              assignedValidationProfile: true,
            },
          });

          if (!before) {
            throw new NotFoundException('Deposit was not found.');
          }

          if (before.status !== 'PENDING_REVIEW') {
            throw new ConflictException(
              'Direct SUPER_ADMIN approval is only available for a deposit pending review.',
            );
          }

          const reviewedAt = new Date();
          const updated = await transaction.deposit.updateMany({
            where: {
              id: depositId,
              status: 'PENDING_REVIEW',
              openKey: before.userId,
            },
            data: {
              status: 'APPROVED',
              openKey: null,
              reviewedByUserId: actor.id,
              reviewedAt,
              reviewNote: dto.note,
            },
          });

          if (updated.count !== 1) {
            throw new ConflictException(
              'Deposit changed concurrently; reload and retry.',
            );
          }

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'APPROVE',
              entityType: 'Deposit',
              entityId: depositId,
              description:
                'SUPER_ADMIN directly approved a submitted deposit without optional ADMIN pre-review.',
              metadata: {
                source: 'ADMIN_DEPOSIT_REVIEW',
                operation: DEPOSIT_AUDIT_OPERATIONS.APPROVE,
                approvalPath: 'SUPER_ADMIN_DIRECT',
                adminPreReviewApplied: false,
                note: dto.note,
                txid: before.txid,
                amount: before.amount.toString(),
                currency: before.currency,
                assignedDepositAccountId: before.assignedDepositAccountId,
                assignedWalletAddress: before.assignedWalletAddress,
                assignedNetwork: before.assignedNetwork,
                assignedValidationProfile: before.assignedValidationProfile,
                readyForApprovalByUserId: null,
                readyForApprovalAt: null,
                reviewedAt: reviewedAt.toISOString(),
                downstreamAccountingApplied: false,
                packageActivationApplied: false,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Deposit state changed concurrently; reload and retry.',
        );
      }
      throw error;
    }

    const { deposit } = await this.depositsService.getDeposit(depositId);

    return {
      message:
        'Deposit directly approved by SUPER_ADMIN. Accounting credit is deferred.',
      deposit,
      alreadyApproved: false,
      approvalPath: 'SUPER_ADMIN_DIRECT' as const,
    };
  }
}
