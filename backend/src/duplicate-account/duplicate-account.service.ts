import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isIP } from 'node:net';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type {
  CreateDuplicateAccountAllowlistDto,
  DuplicateAccountAllowlistType,
} from './dto/create-duplicate-account-allowlist.dto';
import type {
  DuplicateAccountEnforcementMode,
  UpdateDuplicateAccountConfigDto,
} from './dto/update-duplicate-account-config.dto';

const CONFIG_ID = 1;
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DuplicateAccountRiskAction =
  | 'ALLOWED'
  | 'MONITORED'
  | 'RESTRICTED'
  | 'BLOCKED'
  | 'BYPASSED';

export interface ConfigSnapshot {
  enforcementMode: DuplicateAccountEnforcementMode;
  deviceSignalEnabled: boolean;
  ipSignalEnabled: boolean;
  updatedAt: Date | null;
}

export interface RegistrationDuplicateDecision {
  enforcementMode: DuplicateAccountEnforcementMode;
  action: DuplicateAccountRiskAction;
  blockRegistration: boolean;
  restrictAccount: boolean;
  bypassType: DuplicateAccountAllowlistType | null;
  matchedUserIds: string[];
  deviceInstallationId: string | null;
  ipAddress: string | null;
}

@Injectable()
export class DuplicateAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminSnapshot() {
    const [configRow, allowlist, recentEvents] = await Promise.all([
      this.prisma.systemDuplicateAccountConfig.findUnique({
        where: { id: CONFIG_ID },
      }),
      this.prisma.duplicateAccountAllowlist.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.duplicateAccountRiskEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
    ]);

    return {
      config: this.toConfigSnapshot(configRow),
      allowlist,
      recentEvents,
    };
  }

  async updateConfig(
    dto: UpdateDuplicateAccountConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    if (dto.enforcementMode === undefined) {
      throw new BadRequestException(
        'At least one duplicate-account setting must be supplied.',
      );
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const previousRow =
          await transaction.systemDuplicateAccountConfig.findUnique({
            where: { id: CONFIG_ID },
          });
        const previous = this.toConfigSnapshot(previousRow);

        const row = await transaction.systemDuplicateAccountConfig.upsert({
          where: { id: CONFIG_ID },
          create: {
            id: CONFIG_ID,
            enforcementMode: dto.enforcementMode,
            deviceSignalEnabled: true,
            ipSignalEnabled: true,
            updatedByUserId: actor.id,
          },
          update: {
            enforcementMode: dto.enforcementMode,
            updatedByUserId: actor.id,
          },
        });
        const current = this.toConfigSnapshot(row);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemDuplicateAccountConfig',
            entityId: String(CONFIG_ID),
            description:
              'SUPER_ADMIN updated duplicate-account enforcement configuration.',
            metadata: {
              source: 'DUPLICATE_ACCOUNT_CONFIG',
              previous: this.toAuditConfigSnapshot(previous),
              current: this.toAuditConfigSnapshot(current),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Duplicate-account configuration updated.',
          config: current,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async addAllowlist(
    dto: CreateDuplicateAccountAllowlistDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    const value = this.normalizeAllowlistValue(dto.type, dto.value);

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const entry = await transaction.duplicateAccountAllowlist.create({
            data: {
              type: dto.type,
              value,
              label: dto.label?.trim() || null,
              isActive: true,
              createdByUserId: actor.id,
            },
          });

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'CREATE',
              entityType: 'DuplicateAccountAllowlist',
              entityId: entry.id,
              description:
                'SUPER_ADMIN added a duplicate-account allowlist entry.',
              metadata: {
                source: 'DUPLICATE_ACCOUNT_ALLOWLIST',
                type: entry.type,
                value: entry.value,
                label: entry.label,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return {
            message: 'Allowlist entry added.',
            entry,
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This allowlist entry already exists.');
      }

      throw error;
    }
  }

  async removeAllowlist(
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.duplicateAccountAllowlist.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new NotFoundException('Allowlist entry was not found.');
        }

        await transaction.duplicateAccountAllowlist.delete({ where: { id } });
        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'DELETE',
            entityType: 'DuplicateAccountAllowlist',
            entityId: id,
            description:
              'SUPER_ADMIN removed a duplicate-account allowlist entry.',
            metadata: {
              source: 'DUPLICATE_ACCOUNT_ALLOWLIST',
              type: existing.type,
              value: existing.value,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return { message: 'Allowlist entry removed.' };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async evaluateRegistration(input: {
    deviceInstallationId?: string;
    email?: string;
    context?: RequestContext;
  }): Promise<RegistrationDuplicateDecision> {
    const context = input.context ?? {};
    const deviceInstallationId = input.deviceInstallationId
      ? this.normalizeDeviceId(input.deviceInstallationId)
      : null;
    const ipAddress = this.normalizeIp(context.ipAddress);
    const configRow = await this.prisma.systemDuplicateAccountConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    const config = this.toConfigSnapshot(configRow);

    const bypass = await this.findBypass(deviceInstallationId, ipAddress);
    if (bypass) {
      return {
        enforcementMode: config.enforcementMode,
        action: 'BYPASSED',
        blockRegistration: false,
        restrictAccount: false,
        bypassType: bypass,
        matchedUserIds: [],
        deviceInstallationId,
        ipAddress,
      };
    }

    const matchedUserIds =
      config.deviceSignalEnabled && deviceInstallationId
        ? await this.findUsersForDevice(deviceInstallationId)
        : [];

    if (matchedUserIds.length === 0 || config.enforcementMode === 'OFF') {
      return {
        enforcementMode: config.enforcementMode,
        action: 'ALLOWED',
        blockRegistration: false,
        restrictAccount: false,
        bypassType: null,
        matchedUserIds,
        deviceInstallationId,
        ipAddress,
      };
    }

    if (config.enforcementMode === 'MONITOR') {
      return {
        enforcementMode: config.enforcementMode,
        action: 'MONITORED',
        blockRegistration: false,
        restrictAccount: false,
        bypassType: null,
        matchedUserIds,
        deviceInstallationId,
        ipAddress,
      };
    }

    if (config.enforcementMode === 'RESTRICT') {
      return {
        enforcementMode: config.enforcementMode,
        action: 'RESTRICTED',
        blockRegistration: false,
        restrictAccount: true,
        bypassType: null,
        matchedUserIds,
        deviceInstallationId,
        ipAddress,
      };
    }

    return {
      enforcementMode: config.enforcementMode,
      action: 'BLOCKED',
      blockRegistration: true,
      restrictAccount: false,
      bypassType: null,
      matchedUserIds,
      deviceInstallationId,
      ipAddress,
    };
  }

  async recordBlockedRegistration(
    decision: RegistrationDuplicateDecision,
    email: string | undefined,
    context: RequestContext = {},
  ): Promise<void> {
    await this.prisma.duplicateAccountRiskEvent.create({
      data: {
        userId: null,
        attemptedEmail: email?.trim().toLowerCase() ?? null,
        installationId: decision.deviceInstallationId,
        ipAddress: decision.ipAddress,
        enforcementMode: decision.enforcementMode,
        action: 'BLOCKED',
        bypassType: decision.bypassType,
        matchedUserIds: decision.matchedUserIds,
        metadata: {
          source: 'SELF_REGISTRATION',
          reason: 'DEVICE_INSTALLATION_ALREADY_LINKED',
          userAgent: context.userAgent ?? null,
        },
      },
    });
  }

  async recordRegistration(
    transaction: Prisma.TransactionClient,
    decision: RegistrationDuplicateDecision,
    userId: string,
    email: string | undefined,
    context: RequestContext = {},
  ): Promise<void> {
    if (decision.deviceInstallationId) {
      await transaction.userDeviceInstallation.upsert({
        where: {
          userId_installationId: {
            userId,
            installationId: decision.deviceInstallationId,
          },
        },
        create: {
          userId,
          installationId: decision.deviceInstallationId,
          firstSeenIp: decision.ipAddress,
          lastSeenIp: decision.ipAddress,
        },
        update: {
          lastSeenIp: decision.ipAddress,
          lastSeenAt: new Date(),
        },
      });
    }

    await transaction.duplicateAccountRiskEvent.create({
      data: {
        userId,
        attemptedEmail: email?.trim().toLowerCase() ?? null,
        installationId: decision.deviceInstallationId,
        ipAddress: decision.ipAddress,
        enforcementMode: decision.enforcementMode,
        action: decision.action,
        bypassType: decision.bypassType,
        matchedUserIds: decision.matchedUserIds,
        metadata: {
          source: 'SELF_REGISTRATION',
          deviceSignalPresent: Boolean(decision.deviceInstallationId),
          ipSignalPresent: Boolean(decision.ipAddress),
          userAgent: context.userAgent ?? null,
        },
      },
    });
  }

  async observeAuthenticatedDevice(
    user: AuthenticatedUser,
    deviceInstallationId: string,
    context: RequestContext = {},
  ) {
    const installationId = this.normalizeDeviceId(deviceInstallationId);
    const ipAddress = this.normalizeIp(context.ipAddress);
    const existingUsers = await this.findUsersForDevice(installationId);
    const otherUsers = existingUsers.filter((id) => id !== user.id);
    const config = this.toConfigSnapshot(
      await this.prisma.systemDuplicateAccountConfig.findUnique({
        where: { id: CONFIG_ID },
      }),
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userDeviceInstallation.upsert({
        where: {
          userId_installationId: {
            userId: user.id,
            installationId,
          },
        },
        create: {
          userId: user.id,
          installationId,
          firstSeenIp: ipAddress,
          lastSeenIp: ipAddress,
        },
        update: {
          lastSeenIp: ipAddress,
          lastSeenAt: new Date(),
        },
      });

      if (otherUsers.length > 0) {
        await transaction.duplicateAccountRiskEvent.create({
          data: {
            userId: user.id,
            attemptedEmail: user.email,
            installationId,
            ipAddress,
            enforcementMode: config.enforcementMode,
            action: 'MONITORED',
            matchedUserIds: otherUsers,
            metadata: {
              source: 'AUTHENTICATED_DEVICE_OBSERVATION',
              retroactiveEnforcementApplied: false,
            },
          },
        });
      }
    });

    return {
      message: 'Device installation observed.',
      duplicateDeviceObserved: otherUsers.length > 0,
    };
  }

  private async findBypass(
    deviceInstallationId: string | null,
    ipAddress: string | null,
  ): Promise<DuplicateAccountAllowlistType | null> {
    if (deviceInstallationId) {
      const device = await this.prisma.duplicateAccountAllowlist.findFirst({
        where: {
          type: 'DEVICE_INSTALLATION_ID',
          value: deviceInstallationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (device) return 'DEVICE_INSTALLATION_ID';
    }

    if (ipAddress) {
      const ip = await this.prisma.duplicateAccountAllowlist.findFirst({
        where: {
          type: 'IP_ADDRESS',
          value: ipAddress,
          isActive: true,
        },
        select: { id: true },
      });
      if (ip) return 'IP_ADDRESS';
    }

    return null;
  }

  private async findUsersForDevice(installationId: string): Promise<string[]> {
    const rows = await this.prisma.userDeviceInstallation.findMany({
      where: { installationId },
      select: { userId: true },
      distinct: ['userId'],
      take: 100,
    });
    return rows.map((row) => row.userId);
  }

  private normalizeAllowlistValue(
    type: DuplicateAccountAllowlistType,
    value: string,
  ): string {
    const normalized = value.trim();
    if (type === 'DEVICE_INSTALLATION_ID') {
      return this.normalizeDeviceId(normalized);
    }

    const ip = this.normalizeIp(normalized);
    if (!ip || isIP(ip) === 0) {
      throw new BadRequestException('Allowlisted IP address is invalid.');
    }
    return ip;
  }

  private normalizeDeviceId(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!DEVICE_ID_PATTERN.test(normalized)) {
      throw new BadRequestException(
        'Device installation ID must be a valid UUID v4.',
      );
    }
    return normalized;
  }

  private normalizeIp(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  }

  private toConfigSnapshot(
    row: {
      enforcementMode: DuplicateAccountEnforcementMode;
      deviceSignalEnabled: boolean;
      ipSignalEnabled: boolean;
      updatedAt: Date;
    } | null,
  ): ConfigSnapshot {
    return {
      enforcementMode: row?.enforcementMode ?? 'OFF',
      deviceSignalEnabled: row?.deviceSignalEnabled ?? true,
      ipSignalEnabled: row?.ipSignalEnabled ?? true,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private toAuditConfigSnapshot(snapshot: ConfigSnapshot) {
    return {
      enforcementMode: snapshot.enforcementMode,
      deviceSignalEnabled: snapshot.deviceSignalEnabled,
      ipSignalEnabled: snapshot.ipSignalEnabled,
      updatedAt: snapshot.updatedAt?.toISOString() ?? null,
    };
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new BadRequestException(
        'Only SUPER_ADMIN can manage duplicate-account protection.',
      );
    }
  }
}
