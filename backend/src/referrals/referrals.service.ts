import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { AuthenticatedUser } from '../auth/auth-user';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { ListDirectReferralsQueryDto } from './dto/list-direct-referrals-query.dto';
import type { UpdateReferralConfigDto } from './dto/update-referral-config.dto';

const CONFIG_ID = 1;
const MAX_SPONSOR_DEPTH = 1000;
const RANDOM_CODE_BYTES = 8;
const MAX_CODE_ATTEMPTS = 20;

export interface RegistrationReferralEnrollment {
  referralCode: string;
  sponsorUserId: string;
  source: 'REGISTRATION' | 'DEFAULT_SPONSOR';
}

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(user: AuthenticatedUser) {
    const profile = await this.prisma.referralProfile.findUnique({
      where: { userId: user.id },
      include: {
        sponsor: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
      },
    });

    if (!profile) {
      return {
        enrolled: false,
        assignmentStatus: 'UNASSIGNED' as const,
        referralCode: null,
        sponsor: null,
      };
    }

    return {
      enrolled: true,
      assignmentStatus: profile.assignmentStatus,
      referralCode: profile.referralCode,
      sponsor: profile.sponsor,
      assignedAt: profile.assignedAt,
      createdAt: profile.createdAt,
    };
  }

  async listMineDirect(
    user: AuthenticatedUser,
    query: ListDirectReferralsQueryDto,
  ) {
    const skip = (query.page - 1) * query.limit;
    const where = { sponsorUserId: user.id };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.referralProfile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
        skip,
        take: query.limit,
        select: {
          assignmentStatus: true,
          assignedAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.referralProfile.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item.user,
        assignmentStatus: item.assignmentStatus,
        assignedAt: item.assignedAt,
        referralJoinedAt: item.createdAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async getConfig() {
    const config = await this.prisma.systemReferralConfig.findUnique({
      where: { id: CONFIG_ID },
    });

    return this.toConfigSnapshot(config);
  }

  async updateConfig(
    settings: UpdateReferralConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify referral configuration.',
      );
    }

    if (!Object.values(settings).some((value) => value !== undefined)) {
      throw new BadRequestException(
        'At least one referral configuration setting must be supplied.',
      );
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const previousRow = await transaction.systemReferralConfig.findUnique({
          where: { id: CONFIG_ID },
        });
        const previous = this.toConfigSnapshot(previousRow);

        if (
          previous.primaryRootUserId &&
          settings.primaryRootUserId &&
          settings.primaryRootUserId !== previous.primaryRootUserId
        ) {
          throw new ConflictException(
            'Changing an established primary referral root requires a dedicated migration operation.',
          );
        }

        const primaryRootUserId =
          settings.primaryRootUserId ?? previous.primaryRootUserId;
        const defaultSponsorUserId =
          settings.defaultSponsorUserId ?? previous.defaultSponsorUserId;
        const enrollmentEnabled =
          settings.enrollmentEnabled ?? previous.enrollmentEnabled;
        const adminSponsorChangeEnabled =
          settings.adminSponsorChangeEnabled ??
          previous.adminSponsorChangeEnabled;

        if (primaryRootUserId) {
          await this.ensureActiveUser(transaction, primaryRootUserId, 'root');
          await this.ensureRootProfile(transaction, primaryRootUserId);
        }

        if (defaultSponsorUserId) {
          await this.ensureActiveUser(
            transaction,
            defaultSponsorUserId,
            'default sponsor',
          );

          const defaultProfile = await transaction.referralProfile.findUnique({
            where: { userId: defaultSponsorUserId },
            select: { assignmentStatus: true },
          });

          if (
            !defaultProfile ||
            defaultProfile.assignmentStatus === 'UNASSIGNED'
          ) {
            throw new BadRequestException(
              'Default sponsor must already be enrolled in the referral tree.',
            );
          }
        }

        if (
          enrollmentEnabled &&
          (!primaryRootUserId || !defaultSponsorUserId)
        ) {
          throw new BadRequestException(
            'Primary root and default sponsor must be configured before referral enrollment can be enabled.',
          );
        }

        const currentRow = await transaction.systemReferralConfig.upsert({
          where: { id: CONFIG_ID },
          create: {
            id: CONFIG_ID,
            enrollmentEnabled,
            existingUserMigrationMode: 'LEAVE_UNASSIGNED_FOR_REVIEW',
            referralCodeMode: previous.referralCodeMode,
            referralCodePrefix: previous.referralCodePrefix,
            referralCodePattern: previous.referralCodePattern,
            adminSponsorChangeEnabled,
            primaryRootUserId,
            defaultSponsorUserId,
            updatedByUserId: actor.id,
          },
          update: {
            enrollmentEnabled,
            adminSponsorChangeEnabled,
            primaryRootUserId,
            defaultSponsorUserId,
            updatedByUserId: actor.id,
          },
        });

        const current = this.toConfigSnapshot(currentRow);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemReferralConfig',
            entityId: String(CONFIG_ID),
            description: 'SUPER_ADMIN updated referral configuration.',
            metadata: {
              source: 'ADMIN_REFERRAL_CONFIG',
              previous,
              current,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Referral configuration updated.',
          ...current,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async assignSponsor(
    memberUserId: string,
    newSponsorUserId: string,
    reason: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const config = await transaction.systemReferralConfig.findUnique({
          where: { id: CONFIG_ID },
        });

        if (
          !actor.roles.includes(SUPER_ADMIN_ROLE_NAME) &&
          !(config?.adminSponsorChangeEnabled ?? false)
        ) {
          throw new ForbiddenException(
            'ADMIN sponsor changes are disabled by referral configuration.',
          );
        }

        if (memberUserId === newSponsorUserId) {
          throw new BadRequestException('A user cannot sponsor themselves.');
        }

        await this.ensureActiveUser(transaction, memberUserId, 'member');
        await this.ensureActiveUser(transaction, newSponsorUserId, 'sponsor');

        const sponsorProfile = await transaction.referralProfile.findUnique({
          where: { userId: newSponsorUserId },
          select: { userId: true, assignmentStatus: true },
        });

        if (
          !sponsorProfile ||
          sponsorProfile.assignmentStatus === 'UNASSIGNED'
        ) {
          throw new BadRequestException(
            'The selected sponsor is not enrolled in the referral tree.',
          );
        }

        await this.assertNoCycle(transaction, memberUserId, newSponsorUserId);

        const existing = await transaction.referralProfile.findUnique({
          where: { userId: memberUserId },
        });

        if (existing?.assignmentStatus === 'ROOT') {
          throw new BadRequestException(
            'The primary referral root cannot be assigned a sponsor.',
          );
        }

        if (existing?.sponsorUserId === newSponsorUserId) {
          throw new ConflictException(
            'The selected sponsor is already assigned to this user.',
          );
        }

        const source = existing?.sponsorUserId
          ? 'MANUAL_REASSIGNMENT'
          : 'MANUAL_ASSIGNMENT';

        const referralCode =
          existing?.referralCode ??
          (await this.generateReferralCode(transaction, memberUserId));

        const profile = await transaction.referralProfile.upsert({
          where: { userId: memberUserId },
          create: {
            userId: memberUserId,
            referralCode,
            sponsorUserId: newSponsorUserId,
            assignmentStatus: 'ASSIGNED',
            assignedAt: new Date(),
          },
          update: {
            sponsorUserId: newSponsorUserId,
            assignmentStatus: 'ASSIGNED',
            assignedAt: new Date(),
          },
        });

        await transaction.referralSponsorHistory.create({
          data: {
            memberUserId,
            oldSponsorUserId: existing?.sponsorUserId ?? null,
            newSponsorUserId,
            changedByUserId: actor.id,
            source,
            reason: reason.trim(),
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'ReferralProfile',
            entityId: memberUserId,
            description: 'Authorized administrator changed referral sponsor.',
            metadata: {
              source,
              oldSponsorUserId: existing?.sponsorUserId ?? null,
              newSponsorUserId,
              reason: reason.trim(),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Referral sponsor updated.',
          profile,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async enrollRegisteredUser(
    transaction: Prisma.TransactionClient,
    user: { id: string; username: string },
    suppliedReferralCode?: string,
  ): Promise<RegistrationReferralEnrollment | null> {
    const config = await transaction.systemReferralConfig.findUnique({
      where: { id: CONFIG_ID },
    });

    if (!(config?.enrollmentEnabled ?? false)) {
      return null;
    }

    if (!config?.primaryRootUserId || !config.defaultSponsorUserId) {
      throw new ServiceUnavailableException(
        'Referral enrollment is not fully configured.',
      );
    }

    let sponsorUserId = config.defaultSponsorUserId;
    let source: RegistrationReferralEnrollment['source'] = 'DEFAULT_SPONSOR';

    const normalizedReferralCode = suppliedReferralCode?.trim().toUpperCase();

    if (normalizedReferralCode) {
      const sponsor = await transaction.referralProfile.findUnique({
        where: { referralCode: normalizedReferralCode },
        select: {
          userId: true,
          assignmentStatus: true,
          user: { select: { status: true } },
        },
      });

      if (
        !sponsor ||
        sponsor.assignmentStatus === 'UNASSIGNED' ||
        sponsor.user.status !== 'ACTIVE'
      ) {
        throw new BadRequestException('Referral code is invalid or inactive.');
      }

      sponsorUserId = sponsor.userId;
      source = 'REGISTRATION';
    } else {
      const sponsor = await transaction.referralProfile.findUnique({
        where: { userId: sponsorUserId },
        select: {
          assignmentStatus: true,
          user: { select: { status: true } },
        },
      });

      if (
        !sponsor ||
        sponsor.assignmentStatus === 'UNASSIGNED' ||
        sponsor.user.status !== 'ACTIVE'
      ) {
        throw new ServiceUnavailableException(
          'Configured default referral sponsor is unavailable.',
        );
      }
    }

    const referralCode = await this.generateReferralCode(
      transaction,
      user.id,
      user.username,
    );

    await transaction.referralProfile.create({
      data: {
        userId: user.id,
        referralCode,
        sponsorUserId,
        assignmentStatus: 'ASSIGNED',
        assignedAt: new Date(),
      },
    });

    await transaction.referralSponsorHistory.create({
      data: {
        memberUserId: user.id,
        oldSponsorUserId: null,
        newSponsorUserId: sponsorUserId,
        changedByUserId: null,
        source,
        reason: null,
      },
    });

    return { referralCode, sponsorUserId, source };
  }

  private async ensureRootProfile(
    transaction: Prisma.TransactionClient,
    userId: string,
  ) {
    const existing = await transaction.referralProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.sponsorUserId || existing.assignmentStatus === 'ASSIGNED') {
        throw new ConflictException(
          'Configured primary root is already assigned beneath another sponsor.',
        );
      }

      if (existing.assignmentStatus !== 'ROOT') {
        return transaction.referralProfile.update({
          where: { userId },
          data: {
            sponsorUserId: null,
            assignmentStatus: 'ROOT',
            assignedAt: new Date(),
          },
        });
      }

      return existing;
    }

    const referralCode = await this.generateReferralCode(transaction, userId);

    const profile = await transaction.referralProfile.create({
      data: {
        userId,
        referralCode,
        sponsorUserId: null,
        assignmentStatus: 'ROOT',
        assignedAt: new Date(),
      },
    });

    await transaction.referralSponsorHistory.create({
      data: {
        memberUserId: userId,
        oldSponsorUserId: null,
        newSponsorUserId: null,
        changedByUserId: null,
        source: 'ROOT_CONFIGURATION',
        reason: 'Primary referral root configured.',
      },
    });

    return profile;
  }

  private async ensureActiveUser(
    transaction: Prisma.TransactionClient,
    userId: string,
    label: string,
  ) {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      throw new NotFoundException(`Referral ${label} user was not found.`);
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException(`Referral ${label} user must be ACTIVE.`);
    }

    return user;
  }

  private async assertNoCycle(
    transaction: Prisma.TransactionClient,
    memberUserId: string,
    candidateSponsorUserId: string,
  ): Promise<void> {
    const visited = new Set<string>();
    let currentUserId: string | null = candidateSponsorUserId;

    for (let depth = 0; currentUserId; depth += 1) {
      if (depth >= MAX_SPONSOR_DEPTH) {
        throw new ConflictException(
          'Referral tree depth exceeds the supported integrity limit.',
        );
      }

      if (currentUserId === memberUserId) {
        throw new BadRequestException(
          'Sponsor assignment would create a referral cycle.',
        );
      }

      if (visited.has(currentUserId)) {
        throw new ConflictException(
          'Existing referral tree contains a cycle and requires administrator repair.',
        );
      }

      visited.add(currentUserId);

      const profile: { sponsorUserId: string | null } | null =
        await transaction.referralProfile.findUnique({
          where: { userId: currentUserId },
          select: { sponsorUserId: true },
        });

      currentUserId = profile?.sponsorUserId ?? null;
    }
  }

  private async generateReferralCode(
    transaction: Prisma.TransactionClient,
    userId: string,
    knownUsername?: string,
  ): Promise<string> {
    const config = await transaction.systemReferralConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    const mode = config?.referralCodeMode ?? 'SYSTEM_RANDOM';

    if (mode === 'CUSTOM_PATTERN') {
      throw new ServiceUnavailableException(
        'CUSTOM_PATTERN referral codes are not enabled until a validated pattern renderer is configured.',
      );
    }

    if (mode === 'USERNAME') {
      const username =
        knownUsername ??
        (
          await transaction.user.findUnique({
            where: { id: userId },
            select: { username: true },
          })
        )?.username;

      if (!username) {
        throw new NotFoundException('Referral user was not found.');
      }

      const code = username.trim().toUpperCase();
      const collision = await transaction.referralProfile.findUnique({
        where: { referralCode: code },
        select: { userId: true },
      });

      if (collision && collision.userId !== userId) {
        throw new ConflictException(
          'Configured USERNAME referral code collides with an existing code.',
        );
      }

      return code;
    }

    const prefix =
      mode === 'CUSTOM_PREFIX_RANDOM'
        ? config?.referralCodePrefix?.trim().toUpperCase()
        : '';

    if (mode === 'CUSTOM_PREFIX_RANDOM' && !prefix) {
      throw new ServiceUnavailableException(
        'Referral code prefix is not configured.',
      );
    }

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const random = randomBytes(RANDOM_CODE_BYTES)
        .toString('hex')
        .toUpperCase();
      const code = `${prefix ?? ''}${random}`;

      if (code.length > 64) {
        throw new ServiceUnavailableException(
          'Configured referral code exceeds the supported length.',
        );
      }

      const existing = await transaction.referralProfile.findUnique({
        where: { referralCode: code },
        select: { userId: true },
      });

      if (!existing) {
        return code;
      }
    }

    throw new ConflictException('Unable to allocate a unique referral code.');
  }

  private toConfigSnapshot(
    row: {
      enrollmentEnabled: boolean;
      existingUserMigrationMode:
        | 'ASSIGN_DEFAULT_SPONSOR'
        | 'LEAVE_UNASSIGNED_FOR_REVIEW'
        | 'REQUIRE_EXPLICIT_MAPPING';
      referralCodeMode:
        | 'SYSTEM_RANDOM'
        | 'USERNAME'
        | 'CUSTOM_PREFIX_RANDOM'
        | 'CUSTOM_PATTERN';
      referralCodePrefix: string | null;
      referralCodePattern: string | null;
      adminSponsorChangeEnabled: boolean;
      primaryRootUserId: string | null;
      defaultSponsorUserId: string | null;
      updatedAt: Date;
    } | null,
  ) {
    return {
      enrollmentEnabled: row?.enrollmentEnabled ?? false,
      existingUserMigrationMode:
        row?.existingUserMigrationMode ?? 'LEAVE_UNASSIGNED_FOR_REVIEW',
      referralCodeMode: row?.referralCodeMode ?? 'SYSTEM_RANDOM',
      referralCodePrefix: row?.referralCodePrefix ?? null,
      referralCodePattern: row?.referralCodePattern ?? null,
      adminSponsorChangeEnabled: row?.adminSponsorChangeEnabled ?? false,
      primaryRootUserId: row?.primaryRootUserId ?? null,
      defaultSponsorUserId: row?.defaultSponsorUserId ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }
}
