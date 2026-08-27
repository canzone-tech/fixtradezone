import { ForbiddenException, Injectable } from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { DepositPostingMode } from './update-accounting-config.dto';
import { UpdateAccountingConfigDto } from './update-accounting-config.dto';

const CONFIG_ID = 1;
const DEFAULT_DEPOSIT_POSTING_MODE: DepositPostingMode = 'AUTO_ON_APPROVAL';

interface AccountingConfigRow {
  depositPostingMode: DepositPostingMode;
  updatedAt: Date;
}

export interface AccountingConfigSnapshot {
  depositPostingMode: DepositPostingMode;
  updatedAt: Date | null;
}

@Injectable()
export class AccountingConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccounting(): Promise<AccountingConfigSnapshot> {
    return this.getAccountingWithClient(this.prisma);
  }

  async getDepositPostingMode(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<DepositPostingMode> {
    const config = await this.getAccountingWithClient(client);
    return config.depositPostingMode;
  }

  async updateAccounting(
    settings: UpdateAccountingConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.prisma.$transaction(
      async (transaction) => {
        const previous = await this.getAccountingWithClient(transaction);

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO system_accounting_config (
            id,
            depositPostingMode,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${CONFIG_ID},
            ${settings.depositPostingMode},
            ${actor.id},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            depositPostingMode = VALUES(depositPostingMode),
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = CURRENT_TIMESTAMP(3)
        `);

        const current = await this.getAccountingWithClient(transaction);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemAccountingConfig',
            entityId: String(CONFIG_ID),
            description:
              'SUPER_ADMIN updated approved-deposit accounting posting policy.',
            metadata: {
              source: 'ADMIN_ACCOUNTING_CONFIG',
              previous: {
                depositPostingMode: previous.depositPostingMode,
              },
              current: {
                depositPostingMode: current.depositPostingMode,
              },
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Accounting configuration updated.',
          ...current,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async getAccountingWithClient(
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<AccountingConfigSnapshot> {
    const rows = await client.$queryRaw<AccountingConfigRow[]>(Prisma.sql`
      SELECT depositPostingMode, updatedAt
      FROM system_accounting_config
      WHERE id = ${CONFIG_ID}
      LIMIT 1
    `);

    const row = rows[0];
    return {
      depositPostingMode:
        row?.depositPostingMode ?? DEFAULT_DEPOSIT_POSTING_MODE,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }
}
