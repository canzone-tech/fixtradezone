import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { OperationsMode } from './update-operations-config.dto';
import {
  AddSiteModeTesterDto,
  LockEmergencyRecoveryDto,
  type SiteMode,
  UnlockEmergencyRecoveryDto,
  UpdateSiteModeDto,
} from './site-mode.dto';

const CONFIG_ID = 1;
const PLATFORM_TIMEZONE = 'UTC';

interface SiteModeConfigRow {
  platformTimezone: string;
  operationsMode: OperationsMode;
  siteMode: SiteMode;
  modeMessage: string | null;
  launchAt: Date | null;
  recoveryUnlockedUntil: Date | null;
  recoveryReason: string | null;
  updatedAt: Date;
}

interface TesterRow {
  userId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteModeSnapshot {
  platformTimezone: string;
  operationsMode: OperationsMode;
  siteMode: SiteMode;
  modeMessage: string | null;
  launchAt: Date | null;
  recoveryUnlockedUntil: Date | null;
  recoveryReason: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class SiteModeService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicStatus() {
    const current = await this.getFreshSnapshot();
    const now = new Date();

    return {
      siteMode: current.siteMode,
      operationsMode: current.operationsMode,
      message: current.modeMessage,
      launchAt: current.launchAt?.toISOString() ?? null,
      serverTime: now.toISOString(),
      publicApplicationAvailable: current.siteMode === 'LIVE',
      registrationEnabled: current.siteMode === 'LIVE',
      loginAccess:
        current.siteMode === 'LIVE'
          ? 'PUBLIC'
          : current.siteMode === 'TESTING'
            ? 'TESTERS_AND_SUPER_ADMIN'
            : 'SUPER_ADMIN_ONLY',
    };
  }

  async getAdminStatus() {
    const current = await this.getFreshSnapshot();
    const testerCount = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM site_mode_testers`,
    );
    const now = new Date();

    return {
      ...current,
      launchAt: current.launchAt?.toISOString() ?? null,
      recoveryUnlockedUntil:
        current.recoveryUnlockedUntil?.toISOString() ?? null,
      recoveryActive: Boolean(
        current.siteMode === 'LIVE' &&
          current.recoveryUnlockedUntil &&
          current.recoveryUnlockedUntil > now,
      ),
      testerCount: Number(testerCount[0]?.count ?? 0),
    };
  }

  async updateSiteMode(
    dto: UpdateSiteModeDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    const launchAt = dto.launchAt ? new Date(dto.launchAt) : null;
    if (dto.siteMode === 'LIVE' && launchAt) {
      throw new BadRequestException(
        'launchAt is only used while TESTING or MAINTENANCE is active.',
      );
    }
    if (launchAt && launchAt <= new Date()) {
      throw new BadRequestException('launchAt must be in the future.');
    }

    const operationsMode: OperationsMode =
      dto.siteMode === 'LIVE' ? 'AUTOMATIC' : 'CONTROLLED_MANUAL';
    const depositPostingMode =
      operationsMode === 'AUTOMATIC'
        ? 'AUTO_ON_APPROVAL'
        : 'MANUAL_RECONCILIATION';
    const modeMessage = dto.message ?? null;

    return this.prisma.$transaction(
      async (transaction) => {
        const previous = await this.getSnapshotWithClient(transaction);

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO system_operations_config (
            id,
            platformTimezone,
            operationsMode,
            siteMode,
            modeMessage,
            launchAt,
            recoveryUnlockedUntil,
            recoveryReason,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${CONFIG_ID},
            ${PLATFORM_TIMEZONE},
            ${operationsMode},
            ${dto.siteMode},
            ${modeMessage},
            ${launchAt},
            NULL,
            NULL,
            ${actor.id},
            UTC_TIMESTAMP(3),
            UTC_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            platformTimezone = VALUES(platformTimezone),
            operationsMode = VALUES(operationsMode),
            siteMode = VALUES(siteMode),
            modeMessage = VALUES(modeMessage),
            launchAt = VALUES(launchAt),
            recoveryUnlockedUntil = NULL,
            recoveryReason = NULL,
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = UTC_TIMESTAMP(3)
        `);

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

        const current = await this.getSnapshotWithClient(transaction);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemSiteModeConfig',
            entityId: String(CONFIG_ID),
            description:
              'SUPER_ADMIN changed Platform Mode and synchronized the master operations profile.',
            metadata: {
              source: 'SITE_MODE_CONTROL',
              reason: dto.reason,
              previous: this.auditSnapshot(previous),
              current: this.auditSnapshot(current),
              synchronizedDepositPostingMode: depositPostingMode,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message:
            dto.siteMode === 'LIVE'
              ? 'Platform is LIVE. Automatic processing is enabled.'
              : `${dto.siteMode} mode enabled. Automatic processing is paused.`,
          ...(await this.toAdminResponse(current)),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async listTesters() {
    const rows = await this.prisma.$queryRaw<TesterRow[]>(Prisma.sql`
      SELECT
        smt.userId,
        u.username,
        u.email,
        u.firstName,
        u.lastName,
        smt.note,
        smt.createdAt,
        smt.updatedAt
      FROM site_mode_testers smt
      INNER JOIN users u ON u.id = smt.userId
      ORDER BY smt.createdAt ASC, u.username ASC
    `);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async addTester(
    dto: AddSiteModeTesterDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    const identifier = dto.identifier.trim();
    const normalized = identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: normalized }, { email: normalized }],
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Tester user was not found.');
    }
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE users can be testing users.');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO site_mode_testers (
          userId,
          note,
          createdByUserId,
          createdAt,
          updatedAt
        ) VALUES (
          ${user.id},
          ${dto.note ?? null},
          ${actor.id},
          UTC_TIMESTAMP(3),
          UTC_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE
          note = VALUES(note),
          updatedAt = UTC_TIMESTAMP(3)
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SiteModeTester',
          entityId: user.id,
          description: 'SUPER_ADMIN added or updated a Platform Mode tester.',
          metadata: {
            username: user.username,
            email: user.email,
            note: dto.note ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return {
      message: 'Testing access saved.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async removeTester(
    userId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM site_mode_testers WHERE userId = ${userId}
      `);
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SiteModeTester',
          entityId: userId,
          description: 'SUPER_ADMIN removed Platform Mode testing access.',
          metadata: { userId },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return { message: 'Testing access removed.' };
  }

  async unlockEmergencyRecovery(
    dto: UnlockEmergencyRecoveryDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    const current = await this.getFreshSnapshot();
    if (current.siteMode !== 'LIVE') {
      throw new BadRequestException(
        'Emergency recovery unlock is only required while Platform Mode is LIVE.',
      );
    }

    const until = new Date(Date.now() + dto.durationMinutes * 60_000);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE system_operations_config
        SET
          recoveryUnlockedUntil = ${until},
          recoveryReason = ${dto.reason},
          updatedByUserId = ${actor.id},
          updatedAt = UTC_TIMESTAMP(3)
        WHERE id = ${CONFIG_ID}
      `);
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SystemSiteModeConfig',
          entityId: String(CONFIG_ID),
          description: 'SUPER_ADMIN temporarily unlocked emergency recovery.',
          metadata: {
            reason: dto.reason,
            durationMinutes: dto.durationMinutes,
            recoveryUnlockedUntil: until.toISOString(),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return {
      message: 'Emergency recovery temporarily unlocked.',
      recoveryUnlockedUntil: until.toISOString(),
    };
  }

  async lockEmergencyRecovery(
    dto: LockEmergencyRecoveryDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE system_operations_config
        SET
          recoveryUnlockedUntil = NULL,
          recoveryReason = NULL,
          updatedByUserId = ${actor.id},
          updatedAt = UTC_TIMESTAMP(3)
        WHERE id = ${CONFIG_ID}
      `);
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SystemSiteModeConfig',
          entityId: String(CONFIG_ID),
          description: 'SUPER_ADMIN locked emergency recovery.',
          metadata: { reason: dto.reason },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return { message: 'Emergency recovery locked.' };
  }

  async assertRegistrationAllowed(): Promise<void> {
    const current = await this.getFreshSnapshot();
    if (current.siteMode !== 'LIVE') {
      throw new ServiceUnavailableException(
        'Registration is available only while Platform Mode is LIVE.',
      );
    }
  }

  async assertAuthenticatedAccess(user: AuthenticatedUser): Promise<void> {
    const current = await this.getFreshSnapshot();
    if (current.siteMode === 'LIVE' || this.isSuperAdmin(user)) return;

    if (current.siteMode === 'TESTING' && (await this.isTester(user.id))) {
      return;
    }

    throw new ForbiddenException(
      current.siteMode === 'TESTING'
        ? 'FixTradeZone is in TESTING mode. This account does not have testing access.'
        : 'FixTradeZone is in MAINTENANCE mode. SUPER_ADMIN access is required.',
    );
  }

  async assertManualOperationAllowed(user: AuthenticatedUser): Promise<void> {
    const current = await this.getFreshSnapshot();
    if (current.siteMode !== 'LIVE') return;

    const recoveryActive = Boolean(
      current.recoveryUnlockedUntil &&
        current.recoveryUnlockedUntil > new Date(),
    );
    if (this.isSuperAdmin(user) && recoveryActive) return;

    throw new ForbiddenException(
      'Manual recovery is locked while Platform Mode is LIVE. SUPER_ADMIN must explicitly unlock Emergency Recovery first.',
    );
  }

  async activateScheduledLiveIfDue(): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.$executeRaw(Prisma.sql`
        UPDATE system_operations_config
        SET
          siteMode = 'LIVE',
          operationsMode = 'AUTOMATIC',
          modeMessage = NULL,
          launchAt = NULL,
          recoveryUnlockedUntil = NULL,
          recoveryReason = NULL,
          updatedByUserId = NULL,
          updatedAt = UTC_TIMESTAMP(3)
        WHERE id = ${CONFIG_ID}
          AND siteMode IN ('TESTING', 'MAINTENANCE')
          AND launchAt IS NOT NULL
          AND launchAt <= UTC_TIMESTAMP(3)
      `);

      if (Number(changed) !== 1) return false;

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO system_accounting_config (
          id,
          depositPostingMode,
          updatedByUserId,
          createdAt,
          updatedAt
        ) VALUES (
          ${CONFIG_ID},
          'AUTO_ON_APPROVAL',
          NULL,
          UTC_TIMESTAMP(3),
          UTC_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE
          depositPostingMode = 'AUTO_ON_APPROVAL',
          updatedByUserId = NULL,
          updatedAt = UTC_TIMESTAMP(3)
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: null,
          action: 'UPDATE',
          entityType: 'SystemSiteModeConfig',
          entityId: String(CONFIG_ID),
          description:
            'Scheduled Platform Mode transition moved the platform to LIVE.',
          metadata: {
            source: 'SITE_MODE_SCHEDULER',
            siteMode: 'LIVE',
            operationsMode: 'AUTOMATIC',
          },
        },
      });

      return true;
    });
  }

  private async getFreshSnapshot(): Promise<SiteModeSnapshot> {
    let current = await this.getSnapshotWithClient(this.prisma);
    if (
      current.siteMode !== 'LIVE' &&
      current.launchAt &&
      current.launchAt <= new Date()
    ) {
      await this.activateScheduledLiveIfDue();
      current = await this.getSnapshotWithClient(this.prisma);
    }
    return current;
  }

  private async getSnapshotWithClient(
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<SiteModeSnapshot> {
    const rows = await client.$queryRaw<SiteModeConfigRow[]>(Prisma.sql`
      SELECT
        platformTimezone,
        operationsMode,
        siteMode,
        modeMessage,
        launchAt,
        recoveryUnlockedUntil,
        recoveryReason,
        updatedAt
      FROM system_operations_config
      WHERE id = ${CONFIG_ID}
      LIMIT 1
    `);
    const row = rows[0];

    return {
      platformTimezone: row?.platformTimezone ?? PLATFORM_TIMEZONE,
      operationsMode: row?.operationsMode ?? 'AUTOMATIC',
      siteMode: row?.siteMode ?? 'LIVE',
      modeMessage: row?.modeMessage ?? null,
      launchAt: row?.launchAt ?? null,
      recoveryUnlockedUntil: row?.recoveryUnlockedUntil ?? null,
      recoveryReason: row?.recoveryReason ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private async isTester(userId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ allowed: number }>>(
      Prisma.sql`
        SELECT 1 AS allowed
        FROM site_mode_testers
        WHERE userId = ${userId}
        LIMIT 1
      `,
    );
    return rows.length === 1;
  }

  private async toAdminResponse(snapshot: SiteModeSnapshot) {
    const now = new Date();
    return {
      ...snapshot,
      launchAt: snapshot.launchAt?.toISOString() ?? null,
      recoveryUnlockedUntil:
        snapshot.recoveryUnlockedUntil?.toISOString() ?? null,
      recoveryActive: Boolean(
        snapshot.siteMode === 'LIVE' &&
          snapshot.recoveryUnlockedUntil &&
          snapshot.recoveryUnlockedUntil > now,
      ),
    };
  }

  private auditSnapshot(snapshot: SiteModeSnapshot) {
    return {
      siteMode: snapshot.siteMode,
      operationsMode: snapshot.operationsMode,
      modeMessage: snapshot.modeMessage,
      launchAt: snapshot.launchAt?.toISOString() ?? null,
    };
  }

  private isSuperAdmin(user: AuthenticatedUser): boolean {
    return user.roles.includes(SUPER_ADMIN_ROLE_NAME);
  }

  private assertSuperAdmin(user: AuthenticatedUser): void {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }
}
