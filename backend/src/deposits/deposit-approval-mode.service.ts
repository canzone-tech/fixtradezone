import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AUTH_USER_SELECT,
  toAuthenticatedUser,
  type AuthenticatedUser,
} from '../auth/auth-user';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  ConfigureDepositApprovalModeDto,
  DepositApprovalMode,
} from './dto/deposit-approval-mode.dto';

interface ApprovalConfigRow {
  paymentRailId: string;
  approvalMode: DepositApprovalMode;
  revision: number;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface BlockchainConfigRow {
  verificationMode: 'OFF' | 'VERIFY_ONLY';
  chainId: number | null;
  tokenContractAddress: string | null;
  tokenDecimals: number | null;
  requiredConfirmations: number | null;
}

interface DepositPolicyRow {
  depositId: string;
  approvalMode: DepositApprovalMode | null;
  approvalModeUpdatedByUserId: string | null;
  verificationMode: 'OFF' | 'VERIFY_ONLY' | null;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'UNAVAILABLE' | null;
}

@Injectable()
export class DepositApprovalModeService {
  constructor(private readonly prisma: PrismaService) {}

  async getRailApprovalMode(paymentRailId: string) {
    const rail = await this.prisma.depositPaymentRail.findUnique({
      where: { id: paymentRailId },
      select: {
        id: true,
        asset: true,
        networkCode: true,
        displayName: true,
        validationProfile: true,
        isActive: true,
      },
    });
    if (!rail) throw new NotFoundException('Deposit payment rail was not found.');

    const [approval, blockchain] = await Promise.all([
      this.loadApprovalConfig(paymentRailId),
      this.loadBlockchainConfig(paymentRailId),
    ]);
    const approvalMode = approval?.approvalMode ?? 'MANUAL';

    return {
      rail,
      approvalPolicy: {
        approvalMode,
        automaticApprovalEnabled:
          approvalMode === 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
        revision: approval?.revision ?? 0,
        updatedByUserId: approval?.updatedByUserId ?? null,
        createdAt: approval?.createdAt ?? null,
        updatedAt: approval?.updatedAt ?? null,
        blockchainVerificationMode: blockchain?.verificationMode ?? 'OFF',
        automaticApprovalEligible:
          blockchain?.verificationMode === 'VERIFY_ONLY' &&
          blockchain.chainId === 56 &&
          blockchain.tokenContractAddress !== null &&
          blockchain.tokenDecimals !== null &&
          blockchain.requiredConfirmations !== null,
      },
    };
  }

  async configureRailApprovalMode(
    paymentRailId: string,
    dto: ConfigureDepositApprovalModeDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    const rail = await this.prisma.depositPaymentRail.findUnique({
      where: { id: paymentRailId },
      select: {
        id: true,
        asset: true,
        networkCode: true,
        displayName: true,
        validationProfile: true,
      },
    });
    if (!rail) throw new NotFoundException('Deposit payment rail was not found.');

    if (dto.approvalMode === 'AUTO_AFTER_BLOCKCHAIN_VERIFIED') {
      const blockchain = await this.loadBlockchainConfig(paymentRailId);
      if (
        blockchain?.verificationMode !== 'VERIFY_ONLY' ||
        blockchain.chainId !== 56 ||
        blockchain.tokenContractAddress === null ||
        blockchain.tokenDecimals === null ||
        blockchain.requiredConfirmations === null
      ) {
        throw new BadRequestException(
          'Automatic deposit approval requires an enabled and complete BNB Smart Chain VERIFY_ONLY configuration for this payment rail.',
        );
      }
    }

    const before = await this.loadApprovalConfig(paymentRailId);

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO deposit_payment_rail_approval_configs (
            paymentRailId,
            approvalMode,
            revision,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${paymentRailId},
            ${dto.approvalMode},
            1,
            ${actor.id},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            approvalMode = VALUES(approvalMode),
            revision = revision + 1,
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = CURRENT_TIMESTAMP(3)
        `);

        const rows = await transaction.$queryRaw<ApprovalConfigRow[]>(Prisma.sql`
          SELECT
            paymentRailId,
            approvalMode,
            revision,
            updatedByUserId,
            createdAt,
            updatedAt
          FROM deposit_payment_rail_approval_configs
          WHERE paymentRailId = ${paymentRailId}
          LIMIT 1
        `);
        const after = rows[0];
        if (!after) {
          throw new ServiceUnavailableException(
            'Deposit approval mode could not be read back after update.',
          );
        }

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: before ? 'UPDATE' : 'CREATE',
            entityType: 'DepositPaymentRailApprovalConfig',
            entityId: paymentRailId,
            description: `SUPER_ADMIN set deposit approval mode to ${dto.approvalMode} for ${rail.asset}/${rail.networkCode}.`,
            metadata: {
              source: 'ADMIN_DEPOSIT_APPROVAL_MODE',
              operation: 'CONFIGURE_DEPOSIT_APPROVAL_MODE',
              reason: dto.reason,
              before: before ? this.snapshot(before) : null,
              after: this.snapshot(after),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    return this.getRailApprovalMode(paymentRailId);
  }

  async getDepositApprovalPolicy(depositId: string) {
    const rows = await this.prisma.$queryRaw<DepositPolicyRow[]>(Prisma.sql`
      SELECT
        d.id AS depositId,
        approval.approvalMode AS approvalMode,
        approval.updatedByUserId AS approvalModeUpdatedByUserId,
        blockchain.verificationMode AS verificationMode,
        verification.status AS verificationStatus
      FROM deposits d
      INNER JOIN deposit_accounts account
        ON account.id = d.assignedDepositAccountId
      LEFT JOIN deposit_payment_rail_approval_configs approval
        ON approval.paymentRailId = account.paymentRailId
      LEFT JOIN deposit_payment_rail_blockchain_configs blockchain
        ON blockchain.paymentRailId = account.paymentRailId
      LEFT JOIN deposit_blockchain_verifications verification
        ON verification.depositId = d.id
      WHERE d.id = ${depositId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) throw new NotFoundException('Deposit was not found.');

    return {
      depositId,
      approvalMode: row.approvalMode ?? ('MANUAL' as const),
      approvalModeUpdatedByUserId: row.approvalModeUpdatedByUserId,
      verificationMode: row.verificationMode ?? ('OFF' as const),
      verificationStatus: row.verificationStatus,
    };
  }

  async resolveAutomaticApprovalActor(
    depositId: string,
  ): Promise<AuthenticatedUser> {
    const policy = await this.getDepositApprovalPolicy(depositId);
    if (policy.approvalMode !== 'AUTO_AFTER_BLOCKCHAIN_VERIFIED') {
      throw new ConflictException(
        'Automatic blockchain approval is not enabled for this deposit.',
      );
    }
    if (!policy.approvalModeUpdatedByUserId) {
      throw new ServiceUnavailableException(
        'Automatic approval has no configured SUPER_ADMIN audit actor.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: policy.approvalModeUpdatedByUserId },
      select: AUTH_USER_SELECT,
    });
    if (!user) {
      throw new ServiceUnavailableException(
        'The SUPER_ADMIN who enabled automatic deposit approval no longer exists.',
      );
    }

    const actor = toAuthenticatedUser(user);
    if (
      actor.status !== 'ACTIVE' ||
      !actor.roles.includes(SUPER_ADMIN_ROLE_NAME)
    ) {
      throw new ServiceUnavailableException(
        'Automatic deposit approval is paused because its configured audit actor is not an active SUPER_ADMIN.',
      );
    }

    return actor;
  }

  async listAutomaticCandidates(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ depositId: string }>>(
      Prisma.sql`
        SELECT d.id AS depositId
        FROM deposits d
        INNER JOIN deposit_accounts account
          ON account.id = d.assignedDepositAccountId
        INNER JOIN deposit_payment_rail_approval_configs approval
          ON approval.paymentRailId = account.paymentRailId
          AND approval.approvalMode = 'AUTO_AFTER_BLOCKCHAIN_VERIFIED'
        INNER JOIN deposit_payment_rail_blockchain_configs blockchain
          ON blockchain.paymentRailId = account.paymentRailId
          AND blockchain.verificationMode = 'VERIFY_ONLY'
        LEFT JOIN deposit_blockchain_verifications verification
          ON verification.depositId = d.id
        WHERE d.status IN ('PENDING_REVIEW', 'READY_FOR_APPROVAL')
          AND d.txid IS NOT NULL
          AND (
            verification.status IS NULL
            OR verification.status IN ('PENDING', 'UNAVAILABLE', 'VERIFIED')
          )
          AND (
            verification.checkedAt IS NULL
            OR verification.checkedAt <= DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 45 SECOND)
            OR verification.status = 'VERIFIED'
          )
        ORDER BY d.createdAt ASC
        LIMIT 25
      `,
    );

    return rows.map((row) => row.depositId);
  }

  private async loadApprovalConfig(
    paymentRailId: string,
  ): Promise<ApprovalConfigRow | null> {
    const rows = await this.prisma.$queryRaw<ApprovalConfigRow[]>(Prisma.sql`
      SELECT
        paymentRailId,
        approvalMode,
        revision,
        updatedByUserId,
        createdAt,
        updatedAt
      FROM deposit_payment_rail_approval_configs
      WHERE paymentRailId = ${paymentRailId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async loadBlockchainConfig(
    paymentRailId: string,
  ): Promise<BlockchainConfigRow | null> {
    const rows = await this.prisma.$queryRaw<BlockchainConfigRow[]>(Prisma.sql`
      SELECT
        verificationMode,
        chainId,
        tokenContractAddress,
        tokenDecimals,
        requiredConfirmations
      FROM deposit_payment_rail_blockchain_configs
      WHERE paymentRailId = ${paymentRailId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN may change deposit approval mode.',
      );
    }
  }

  private snapshot(config: ApprovalConfigRow) {
    return {
      approvalMode: config.approvalMode,
      revision: config.revision,
      updatedByUserId: config.updatedByUserId,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
