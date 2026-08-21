import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

const SECURITY_CONFIG_ID = 1;

export const DEFAULT_IDLE_LOCK_MINUTES = 5;
export const MIN_IDLE_LOCK_MINUTES = 1;
export const MAX_IDLE_LOCK_MINUTES = 120;

export interface SecurityConfigSnapshot {
  fullUserImpersonationEnabled: boolean;
  idleLockMinutes: number;
  updatedAt: Date | null;
}

export interface SecurityConfigUpdate {
  fullUserImpersonationEnabled?: boolean;
  idleLockMinutes?: number;
}

@Injectable()
export class SecurityConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SecurityConfigSnapshot> {
    const config = await this.prisma.systemSecurityConfig.findUnique({
      where: {
        id: SECURITY_CONFIG_ID,
      },
    });

    return {
      fullUserImpersonationEnabled:
        config?.fullUserImpersonationEnabled ?? false,
      idleLockMinutes: config?.idleLockMinutes ?? DEFAULT_IDLE_LOCK_MINUTES,
      updatedAt: config?.updatedAt ?? null,
    };
  }

  async update(
    settings: SecurityConfigUpdate,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    this.assertValidUpdate(settings);

    return this.prisma.$transaction(
      async (transaction) => {
        const previous = await transaction.systemSecurityConfig.findUnique({
          where: {
            id: SECURITY_CONFIG_ID,
          },
        });

        const previousFullImpersonation =
          previous?.fullUserImpersonationEnabled ?? false;

        const previousIdleLockMinutes =
          previous?.idleLockMinutes ?? DEFAULT_IDLE_LOCK_MINUTES;

        const nextFullImpersonation =
          settings.fullUserImpersonationEnabled ?? previousFullImpersonation;

        const nextIdleLockMinutes =
          settings.idleLockMinutes ?? previousIdleLockMinutes;

        const config = await transaction.systemSecurityConfig.upsert({
          where: {
            id: SECURITY_CONFIG_ID,
          },
          create: {
            id: SECURITY_CONFIG_ID,
            fullUserImpersonationEnabled: nextFullImpersonation,
            idleLockMinutes: nextIdleLockMinutes,
            updatedByUserId: actor.id,
          },
          update: {
            fullUserImpersonationEnabled: nextFullImpersonation,
            idleLockMinutes: nextIdleLockMinutes,
            updatedByUserId: actor.id,
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemSecurityConfig',
            entityId: String(SECURITY_CONFIG_ID),
            description: 'SUPER_ADMIN updated platform security configuration.',
            metadata: {
              source: 'ADMIN_SECURITY_CONFIG',
              previous: {
                fullUserImpersonationEnabled: previousFullImpersonation,
                idleLockMinutes: previousIdleLockMinutes,
              },
              current: {
                fullUserImpersonationEnabled:
                  config.fullUserImpersonationEnabled,
                idleLockMinutes: config.idleLockMinutes,
              },
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Security configuration updated.',
          fullUserImpersonationEnabled: config.fullUserImpersonationEnabled,
          idleLockMinutes: config.idleLockMinutes,
          updatedAt: config.updatedAt,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify platform security configuration.',
      );
    }
  }

  private assertValidUpdate(settings: SecurityConfigUpdate): void {
    if (
      settings.fullUserImpersonationEnabled === undefined &&
      settings.idleLockMinutes === undefined
    ) {
      throw new BadRequestException(
        'At least one security setting must be supplied.',
      );
    }

    if (
      settings.idleLockMinutes !== undefined &&
      (!Number.isInteger(settings.idleLockMinutes) ||
        settings.idleLockMinutes < MIN_IDLE_LOCK_MINUTES ||
        settings.idleLockMinutes > MAX_IDLE_LOCK_MINUTES)
    ) {
      throw new BadRequestException(
        `Idle lock time must be between ${MIN_IDLE_LOCK_MINUTES} and ${MAX_IDLE_LOCK_MINUTES} minutes.`,
      );
    }
  }
}
