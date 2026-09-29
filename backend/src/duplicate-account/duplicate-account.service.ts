import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import type { UpsertUserDevicePolicyDto } from './dto/upsert-user-device-policy.dto';

const CONFIG_ID = 1;
const DEFAULT_MAX_DEVICES = 1;
const MAX_CONFIGURABLE_DEVICES = 5;
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DuplicateAccountRiskAction =
  'ALLOWED' | 'MONITORED' | 'RESTRICTED' | 'BLOCKED' | 'BYPASSED';

type DuplicateAccountRiskReason =
  | 'DEVICE_INSTALLATION_ALREADY_LINKED'
  | 'DEVICE_INSTALLATION_SIGNAL_MISSING'
  | 'USER_DEVICE_LIMIT_REACHED'
  | 'SUPER_ADMIN_EXEMPTION';

type UserDevicePolicyRow = {
  userId: string;
  maxDevices: number;
  label: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type UserDevicePolicyAdminRow = UserDevicePolicyRow & {
  email: string | null;
  username: string;
};

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

export interface LoginDuplicateDecision {
  enforcementMode: DuplicateAccountEnforcementMode;
  action: DuplicateAccountRiskAction;
  blockLogin: boolean;
  bindDevice: boolean;
  matchedUserIds: string[];
  deviceInstallationId: string | null;
  ipAddress: string | null;
  reason: DuplicateAccountRiskReason | null;
}

@Injectable()
export class DuplicateAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminSnapshot() {
    const [configRow, allowlist, recentEvents, devicePolicies] =
      await Promise.all([
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
        this.prisma.$queryRaw<UserDevicePolicyAdminRow[]>`
          SELECT
            p.userId,
            p.maxDevices,
            p.label,
            p.updatedByUserId,
            p.createdAt,
            p.updatedAt,
            u.email,
            u.username
          FROM duplicate_account_user_device_policies p
          INNER JOIN users u ON u.id = p.userId
          ORDER BY p.updatedAt DESC, p.userId ASC
        `,
      ]);

    return {
      config: this.toConfigSnapshot(configRow),
      allowlist,
      devicePolicies,
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
        const existing = await transaction.duplicateAccountAllowlist.findUnique(
          {
            where: { id },
          },
        );

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

  async upsertUserDevicePolicy(
    userId: string,
    dto: UpsertUserDevicePolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    const label = dto.label?.trim() || null;

    return this.prisma.$transaction(
      async (transaction) => {
        const target = await transaction.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, username: true },
        });
        if (!target) {
          throw new NotFoundException('User was not found.');
        }

        const previousRows = await transaction.$queryRaw<UserDevicePolicyRow[]>`
          SELECT
            userId,
            maxDevices,
            label,
            updatedByUserId,
            createdAt,
            updatedAt
          FROM duplicate_account_user_device_policies
          WHERE userId = ${userId}
          LIMIT 1
        `;
        const previous = previousRows[0] ?? null;

        await transaction.$executeRaw`
          INSERT INTO duplicate_account_user_device_policies (
            userId,
            maxDevices,
            label,
            updatedByUserId,
            createdAt,
            updatedAt
          ) VALUES (
            ${userId},
            ${dto.maxDevices},
            ${label},
            ${actor.id},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
          ON DUPLICATE KEY UPDATE
            maxDevices = VALUES(maxDevices),
            label = VALUES(label),
            updatedByUserId = VALUES(updatedByUserId),
            updatedAt = CURRENT_TIMESTAMP(3)
        `;

        const currentRows = await transaction.$queryRaw<UserDevicePolicyRow[]>`
          SELECT
            userId,
            maxDevices,
            label,
            updatedByUserId,
            createdAt,
            updatedAt
          FROM duplicate_account_user_device_policies
          WHERE userId = ${userId}
          LIMIT 1
        `;
        const current = currentRows[0];
        if (!current) {
          throw new ConflictException('Unable to persist user device policy.');
        }

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: previous ? 'UPDATE' : 'CREATE',
            entityType: 'DuplicateAccountUserDevicePolicy',
            entityId: userId,
            description:
              'SUPER_ADMIN updated a per-user duplicate-account device limit.',
            metadata: {
              source: 'DUPLICATE_ACCOUNT_USER_DEVICE_POLICY',
              targetUser: {
                id: target.id,
                email: target.email,
                username: target.username,
              },
              previous: previous
                ? {
                    maxDevices: previous.maxDevices,
                    label: previous.label,
                  }
                : null,
              current: {
                maxDevices: current.maxDevices,
                label: current.label,
              },
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'User device policy updated.',
          policy: {
            ...current,
            email: target.email,
            username: target.username,
          },
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async removeUserDevicePolicy(
    userId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<UserDevicePolicyRow[]>`
          SELECT
            userId,
            maxDevices,
            label,
            updatedByUserId,
            createdAt,
            updatedAt
          FROM duplicate_account_user_device_policies
          WHERE userId = ${userId}
          LIMIT 1
        `;
        const existing = rows[0];
        if (!existing) {
          throw new NotFoundException('User device policy was not found.');
        }

        await transaction.$executeRaw`
          DELETE FROM duplicate_account_user_device_policies
          WHERE userId = ${userId}
        `;

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'DELETE',
            entityType: 'DuplicateAccountUserDevicePolicy',
            entityId: userId,
            description:
              'SUPER_ADMIN removed a per-user duplicate-account device limit override.',
            metadata: {
              source: 'DUPLICATE_ACCOUNT_USER_DEVICE_POLICY',
              previous: {
                maxDevices: existing.maxDevices,
                label: existing.label,
              },
              current: {
                maxDevices: DEFAULT_MAX_DEVICES,
                label: null,
              },
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'User device policy removed. Default one-device limit applies.',
        };
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
    const configRow = await this.prisma.systemDuplicateAccountConfig.findUnique(
      {
        where: { id: CONFIG_ID },
      },
    );
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

    if (
      config.deviceSignalEnabled &&
      !deviceInstallationId &&
      config.enforcementMode !== 'OFF'
    ) {
      if (config.enforcementMode === 'MONITOR') {
        return {
          enforcementMode: config.enforcementMode,
          action: 'MONITORED',
          blockRegistration: false,
          restrictAccount: false,
          bypassType: null,
          matchedUserIds: [],
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
          matchedUserIds: [],
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

  async evaluateLogin(input: {
    userId: string;
    isSuperAdmin: boolean;
    deviceInstallationId?: string;
    context?: RequestContext;
  }): Promise<LoginDuplicateDecision> {
    const context = input.context ?? {};
    const deviceInstallationId = input.deviceInstallationId
      ? this.normalizeDeviceId(input.deviceInstallationId)
      : null;
    const ipAddress = this.normalizeIp(context.ipAddress);
    const config = this.toConfigSnapshot(
      await this.prisma.systemDuplicateAccountConfig.findUnique({
        where: { id: CONFIG_ID },
      }),
    );
    const matchedUserIds = deviceInstallationId
      ? await this.findUsersForDevice(deviceInstallationId)
      : [];
    const otherUserIds = matchedUserIds.filter((id) => id !== input.userId);

    if (input.isSuperAdmin) {
      const exempt = !deviceInstallationId || otherUserIds.length > 0;
      return {
        enforcementMode: config.enforcementMode,
        action: exempt ? 'BYPASSED' : 'ALLOWED',
        blockLogin: false,
        bindDevice: Boolean(deviceInstallationId) && otherUserIds.length === 0,
        matchedUserIds: otherUserIds,
        deviceInstallationId,
        ipAddress,
        reason: exempt ? 'SUPER_ADMIN_EXEMPTION' : null,
      };
    }

    if (config.enforcementMode === 'OFF' || !config.deviceSignalEnabled) {
      return {
        enforcementMode: config.enforcementMode,
        action: 'ALLOWED',
        blockLogin: false,
        bindDevice: Boolean(deviceInstallationId),
        matchedUserIds: otherUserIds,
        deviceInstallationId,
        ipAddress,
        reason: null,
      };
    }

    if (!deviceInstallationId) {
      if (config.enforcementMode === 'MONITOR') {
        return {
          enforcementMode: config.enforcementMode,
          action: 'MONITORED',
          blockLogin: false,
          bindDevice: false,
          matchedUserIds: [],
          deviceInstallationId,
          ipAddress,
          reason: 'DEVICE_INSTALLATION_SIGNAL_MISSING',
        };
      }

      return {
        enforcementMode: config.enforcementMode,
        action:
          config.enforcementMode === 'RESTRICT' ? 'RESTRICTED' : 'BLOCKED',
        blockLogin: true,
        bindDevice: false,
        matchedUserIds: [],
        deviceInstallationId,
        ipAddress,
        reason: 'DEVICE_INSTALLATION_SIGNAL_MISSING',
      };
    }

    if (otherUserIds.length > 0) {
      if (config.enforcementMode === 'MONITOR') {
        return {
          enforcementMode: config.enforcementMode,
          action: 'MONITORED',
          blockLogin: false,
          bindDevice: false,
          matchedUserIds: otherUserIds,
          deviceInstallationId,
          ipAddress,
          reason: 'DEVICE_INSTALLATION_ALREADY_LINKED',
        };
      }

      return {
        enforcementMode: config.enforcementMode,
        action:
          config.enforcementMode === 'RESTRICT' ? 'RESTRICTED' : 'BLOCKED',
        blockLogin: true,
        bindDevice: false,
        matchedUserIds: otherUserIds,
        deviceInstallationId,
        ipAddress,
        reason: 'DEVICE_INSTALLATION_ALREADY_LINKED',
      };
    }

    const [deviceIds, maxDevices] = await Promise.all([
      this.findUserDeviceIds(input.userId),
      this.getUserMaxDevices(input.userId),
    ]);
    const deviceAllowed = this.canUseDevice(
      deviceInstallationId,
      deviceIds,
      maxDevices,
    );

    if (deviceAllowed) {
      return {
        enforcementMode: config.enforcementMode,
        action: 'ALLOWED',
        blockLogin: false,
        bindDevice: true,
        matchedUserIds: [],
        deviceInstallationId,
        ipAddress,
        reason: null,
      };
    }

    if (config.enforcementMode === 'MONITOR') {
      return {
        enforcementMode: config.enforcementMode,
        action: 'MONITORED',
        blockLogin: false,
        bindDevice: false,
        matchedUserIds: [],
        deviceInstallationId,
        ipAddress,
        reason: 'USER_DEVICE_LIMIT_REACHED',
      };
    }

    return {
      enforcementMode: config.enforcementMode,
      action: config.enforcementMode === 'RESTRICT' ? 'RESTRICTED' : 'BLOCKED',
      blockLogin: true,
      bindDevice: false,
      matchedUserIds: [],
      deviceInstallationId,
      ipAddress,
      reason: 'USER_DEVICE_LIMIT_REACHED',
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
          reason: decision.deviceInstallationId
            ? 'DEVICE_INSTALLATION_ALREADY_LINKED'
            : 'DEVICE_INSTALLATION_SIGNAL_MISSING',
          userAgent: context.userAgent ?? null,
        },
      },
    });
  }

  async recordBlockedLogin(
    decision: LoginDuplicateDecision,
    user: Pick<AuthenticatedUser, 'id' | 'email'>,
    context: RequestContext = {},
  ): Promise<void> {
    await this.prisma.duplicateAccountRiskEvent.create({
      data: {
        userId: user.id,
        attemptedEmail: user.email,
        installationId: decision.deviceInstallationId,
        ipAddress: decision.ipAddress,
        enforcementMode: decision.enforcementMode,
        action: decision.action,
        bypassType: null,
        matchedUserIds: decision.matchedUserIds,
        metadata: {
          source: 'LOGIN',
          reason: decision.reason,
          deviceSignalPresent: Boolean(decision.deviceInstallationId),
          ipSignalPresent: Boolean(decision.ipAddress),
          userAgent: context.userAgent ?? null,
        },
      },
    });
  }

  async recordSuccessfulLogin(
    transaction: Prisma.TransactionClient,
    decision: LoginDuplicateDecision,
    user: Pick<AuthenticatedUser, 'id' | 'email' | 'roles'>,
    context: RequestContext = {},
  ): Promise<void> {
    let runtimeRiskReason: DuplicateAccountRiskReason | null = null;
    let runtimeMatchedUserIds: string[] = [];

    if (decision.bindDevice && decision.deviceInstallationId) {
      let canBind = true;

      if (
        !user.roles.includes(SUPER_ADMIN_ROLE_NAME) &&
        decision.enforcementMode !== 'OFF'
      ) {
        runtimeMatchedUserIds = (
          await this.findUsersForDeviceInTransaction(
            transaction,
            decision.deviceInstallationId,
          )
        ).filter((id) => id !== user.id);

        if (runtimeMatchedUserIds.length > 0) {
          canBind = false;
          runtimeRiskReason = 'DEVICE_INSTALLATION_ALREADY_LINKED';
        } else {
          const [deviceIds, maxDevices] = await Promise.all([
            this.findUserDeviceIdsInTransaction(transaction, user.id),
            this.getUserMaxDevicesInTransaction(transaction, user.id),
          ]);
          canBind = this.canUseDevice(
            decision.deviceInstallationId,
            deviceIds,
            maxDevices,
          );
          if (!canBind) {
            runtimeRiskReason = 'USER_DEVICE_LIMIT_REACHED';
          }
        }
      }

      if (!canBind && decision.enforcementMode !== 'MONITOR') {
        throw new ForbiddenException(
          'Login is blocked by the duplicate-account protection policy.',
        );
      }

      if (canBind) {
        await transaction.userDeviceInstallation.upsert({
          where: {
            userId_installationId: {
              userId: user.id,
              installationId: decision.deviceInstallationId,
            },
          },
          create: {
            userId: user.id,
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
    }

    if (runtimeRiskReason) {
      await transaction.duplicateAccountRiskEvent.create({
        data: {
          userId: user.id,
          attemptedEmail: user.email,
          installationId: decision.deviceInstallationId,
          ipAddress: decision.ipAddress,
          enforcementMode: decision.enforcementMode,
          action: 'MONITORED',
          bypassType: null,
          matchedUserIds: runtimeMatchedUserIds,
          metadata: {
            source: 'LOGIN',
            reason: runtimeRiskReason,
            raceRevalidation: true,
            deviceSignalPresent: Boolean(decision.deviceInstallationId),
            ipSignalPresent: Boolean(decision.ipAddress),
            userAgent: context.userAgent ?? null,
          },
        },
      });
    }

    if (decision.action === 'ALLOWED') return;

    await transaction.duplicateAccountRiskEvent.create({
      data: {
        userId: user.id,
        attemptedEmail: user.email,
        installationId: decision.deviceInstallationId,
        ipAddress: decision.ipAddress,
        enforcementMode: decision.enforcementMode,
        action: decision.action,
        bypassType: null,
        matchedUserIds: decision.matchedUserIds,
        metadata: {
          source: 'LOGIN',
          reason: decision.reason,
          deviceSignalPresent: Boolean(decision.deviceInstallationId),
          ipSignalPresent: Boolean(decision.ipAddress),
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
    const config = this.toConfigSnapshot(
      await this.prisma.systemDuplicateAccountConfig.findUnique({
        where: { id: CONFIG_ID },
      }),
    );

    return this.prisma.$transaction(
      async (transaction) => {
        const otherUsers = (
          await this.findUsersForDeviceInTransaction(transaction, installationId)
        ).filter((id) => id !== user.id);
        let canBind = otherUsers.length === 0;
        let reason: DuplicateAccountRiskReason | null =
          otherUsers.length > 0 ? 'DEVICE_INSTALLATION_ALREADY_LINKED' : null;

        if (
          canBind &&
          !user.roles.includes(SUPER_ADMIN_ROLE_NAME) &&
          config.enforcementMode !== 'OFF' &&
          config.deviceSignalEnabled
        ) {
          const [deviceIds, maxDevices] = await Promise.all([
            this.findUserDeviceIdsInTransaction(transaction, user.id),
            this.getUserMaxDevicesInTransaction(transaction, user.id),
          ]);
          canBind = this.canUseDevice(installationId, deviceIds, maxDevices);
          if (!canBind) {
            reason = 'USER_DEVICE_LIMIT_REACHED';
          }
        }

        if (canBind) {
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
        } else {
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
                reason,
                retroactiveEnforcementApplied: false,
              },
            },
          });
        }

        return {
          message: canBind
            ? 'Device installation observed.'
            : 'Device installation was observed but not bound.',
          deviceObserved: canBind,
          duplicateDeviceObserved: otherUsers.length > 0,
          deviceLimitReached: reason === 'USER_DEVICE_LIMIT_REACHED',
        };
      },
      { isolationLevel: 'Serializable' },
    );
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

  private async findUsersForDeviceInTransaction(
    transaction: Prisma.TransactionClient,
    installationId: string,
  ): Promise<string[]> {
    const rows = await transaction.userDeviceInstallation.findMany({
      where: { installationId },
      select: { userId: true },
      distinct: ['userId'],
      take: 100,
    });
    return rows.map((row) => row.userId);
  }

  private async findUserDeviceIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userDeviceInstallation.findMany({
      where: { userId },
      select: { installationId: true },
      orderBy: [
        { lastSeenAt: 'desc' },
        { firstSeenAt: 'asc' },
        { id: 'asc' },
      ],
      take: 100,
    });
    return rows.map((row) => row.installationId);
  }

  private async findUserDeviceIdsInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<string[]> {
    const rows = await transaction.userDeviceInstallation.findMany({
      where: { userId },
      select: { installationId: true },
      orderBy: [
        { lastSeenAt: 'desc' },
        { firstSeenAt: 'asc' },
        { id: 'asc' },
      ],
      take: 100,
    });
    return rows.map((row) => row.installationId);
  }

  private async getUserMaxDevices(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ maxDevices: number }>>`
      SELECT maxDevices
      FROM duplicate_account_user_device_policies
      WHERE userId = ${userId}
      LIMIT 1
    `;
    return this.normalizeMaxDevices(rows[0]?.maxDevices);
  }

  private async getUserMaxDevicesInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const rows = await transaction.$queryRaw<Array<{ maxDevices: number }>>`
      SELECT maxDevices
      FROM duplicate_account_user_device_policies
      WHERE userId = ${userId}
      LIMIT 1
    `;
    return this.normalizeMaxDevices(rows[0]?.maxDevices);
  }

  private canUseDevice(
    installationId: string,
    orderedDeviceIds: string[],
    maxDevices: number,
  ): boolean {
    const approvedDeviceIds = orderedDeviceIds.slice(0, maxDevices);
    if (approvedDeviceIds.includes(installationId)) return true;

    if (orderedDeviceIds.includes(installationId)) return false;

    return orderedDeviceIds.length < maxDevices;
  }

  private normalizeMaxDevices(value: number | undefined): number {
    if (!Number.isInteger(value)) return DEFAULT_MAX_DEVICES;
    return Math.min(
      MAX_CONFIGURABLE_DEVICES,
      Math.max(DEFAULT_MAX_DEVICES, value ?? DEFAULT_MAX_DEVICES),
    );
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
