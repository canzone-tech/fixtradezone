import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { OperationsMode } from './update-operations-config.dto';
import { UpdateOperationsConfigDto } from './update-operations-config.dto';

const CONFIG_ID = 1;
export const DEFAULT_PLATFORM_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_OPERATIONS_MODE: OperationsMode = 'AUTOMATIC';

interface OperationsConfigRow {
  platformTimezone: string;
  operationsMode: OperationsMode;
  updatedAt: Date;
}

export interface OperationsConfigSnapshot {
  platformTimezone: string;
  operationsMode: OperationsMode;
  updatedAt: Date | null;
}

@Injectable()
export class OperationsConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperations(): Promise<OperationsConfigSnapshot> {
    return this.getOperationsWithClient(this.prisma);
  }

  async getPlatformTime() {
    const config = await this.getOperations();
    return { platformTimezone: config.platformTimezone };
  }

  async getOperationsMode(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<OperationsMode> {
    return (await this.getOperationsWithClient(client)).operationsMode;
  }

  async isAutomatic(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    return (await this.getOperationsMode(client)) === 'AUTOMATIC';
  }

  async updateOperations(
    settings: UpdateOperationsConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    this.assertValidTimezone(settings.platformTimezone);

    return this.prisma.$transaction(
      async (transaction) => {
        const previous = await this.getOperationsWithClient(transaction);
        const depositPostingMode =
          settings.operationsMode === 'AUTOMATIC'
            ? 'AUTO_ON_APPROVAL'
            : 'MANUAL_RECONCILIATION';

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO system_operations_config (
            id,
            platformTimezone,
            operationsMode,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${CONFIG_ID},
            ${settings.platformTimezone},
            ${settings.operationsMode},
            ${actor.id},
            UTC_TIMESTAMP(3),
            UTC_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            platformTimezone = VALUES(platformTimezone),
            operationsMode = VALUES(operationsMode),
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = UTC_TIMESTAMP(3)
        `);

        // Keep the legacy accounting endpoint/state compatible with the single
        // operations mode so old clients cannot observe contradictory policy.
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO system_accounting_config (
            id,
            depositPostingMode,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${CONFIG_ID},
            ${depositPostingMode},
            ${actor.id},
            UTC_TIMESTAMP(3),
            UTC_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            depositPostingMode = VALUES(depositPostingMode),
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = UTC_TIMESTAMP(3)
        `);

        const current = await this.getOperationsWithClient(transaction);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemOperationsConfig',
            entityId: String(CONFIG_ID),
            description:
              'SUPER_ADMIN updated platform timezone and operations automation mode.',
            metadata: {
              source: 'ADMIN_OPERATIONS_CONFIG',
              previous: {
                platformTimezone: previous.platformTimezone,
                operationsMode: previous.operationsMode,
              },
              current: {
                platformTimezone: current.platformTimezone,
                operationsMode: current.operationsMode,
              },
              synchronizedDepositPostingMode: depositPostingMode,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Operations configuration updated.',
          ...current,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async getOperationsWithClient(
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<OperationsConfigSnapshot> {
    const rows = await client.$queryRaw<OperationsConfigRow[]>(Prisma.sql`
      SELECT platformTimezone, operationsMode, updatedAt
      FROM system_operations_config
      WHERE id = ${CONFIG_ID}
      LIMIT 1
    `);

    const row = rows[0];
    return {
      platformTimezone: row?.platformTimezone ?? DEFAULT_PLATFORM_TIMEZONE,
      operationsMode: row?.operationsMode ?? DEFAULT_OPERATIONS_MODE,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private assertValidTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException(
        'platformTimezone must be a valid IANA timezone.',
      );
    }
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }
}
