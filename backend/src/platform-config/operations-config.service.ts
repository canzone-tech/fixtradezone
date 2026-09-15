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
import {
  PLATFORM_TIMEZONE,
  UpdateOperationsConfigDto,
} from './update-operations-config.dto';

const CONFIG_ID = 1;
export const DEFAULT_PLATFORM_TIMEZONE = PLATFORM_TIMEZONE;
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

  updateOperations(
    settings: UpdateOperationsConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<never> {
    void context;

    return Promise.resolve().then(() => {
      this.assertSuperAdmin(actor);
      this.assertUtcTimezone(settings.platformTimezone);

      throw new BadRequestException(
        'Operations mode is controlled by Platform Mode. Use /admin/settings/site-mode.',
      );
    });
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

  private assertUtcTimezone(timezone: string): void {
    if (timezone !== PLATFORM_TIMEZONE) {
      throw new BadRequestException(
        'platformTimezone is locked to UTC for FixTradeZone.',
      );
    }
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }
}
