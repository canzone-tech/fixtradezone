import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ADMIN_ROLE_NAME,
  SUPER_ADMIN_ROLE_NAME,
} from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import {
  createRandomPublicUsername,
  PUBLIC_USERNAME_MAX_ATTEMPTS,
} from '../auth/public-username.util';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

export const LEGACY_USERNAME_MIGRATION_CONFIRMATION =
  'MIGRATE_LEGACY_PUBLIC_USERNAMES';

const LEGACY_SEQUENCE_PATTERN = /^\d{6}$/;
const LEGACY_SEQUENCE_START = 100001;

type LegacyCandidate = {
  id: string;
  email: string | null;
  username: string;
  createdAt: Date;
  auditLogs: Array<{
    entityId: string | null;
    metadata: unknown;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class LegacyUsernameMigrationService {
  constructor(private readonly prisma: PrismaService) {}

  async preview() {
    const candidates = await this.prisma.$transaction(
      (transaction) => this.findCandidates(transaction),
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      count: candidates.length,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        email: candidate.email,
        username: candidate.username,
        createdAt: candidate.createdAt,
      })),
    };
  }

  async execute(
    confirmation: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    if (confirmation !== LEGACY_USERNAME_MIGRATION_CONFIRMATION) {
      throw new BadRequestException(
        `confirmation must equal ${LEGACY_USERNAME_MIGRATION_CONFIRMATION}`,
      );
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const candidates = await this.findCandidates(transaction);
        const migrated: Array<{
          id: string;
          email: string | null;
          previousUsername: string;
          username: string;
        }> = [];

        for (const candidate of candidates) {
          const username = await this.allocateUsername(transaction);

          await transaction.user.update({
            where: { id: candidate.id },
            data: { username },
          });

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'UPDATE',
              entityType: 'User',
              entityId: candidate.id,
              description:
                'SUPER_ADMIN migrated a legacy system-generated username.',
              metadata: {
                source: 'LEGACY_PUBLIC_USERNAME_MIGRATION',
                previousUsername: candidate.username,
                newUsername: username,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          migrated.push({
            id: candidate.id,
            email: candidate.email,
            previousUsername: candidate.username,
            username,
          });
        }

        return {
          message:
            migrated.length === 0
              ? 'No eligible legacy generated usernames remain.'
              : 'Legacy generated usernames migrated successfully.',
          migratedCount: migrated.length,
          migrated,
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async findCandidates(
    transaction: Prisma.TransactionClient,
  ): Promise<LegacyCandidate[]> {
    const users = await transaction.user.findMany({
      where: {
        username: {
          gte: LEGACY_SEQUENCE_START.toString(),
          lte: '999999',
        },
        roles: {
          none: {
            role: {
              name: {
                in: [ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_NAME],
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        auditLogs: {
          where: {
            action: 'CREATE',
            entityType: 'User',
          },
          orderBy: { createdAt: 'asc' },
          select: {
            entityId: true,
            metadata: true,
          },
        },
      },
    });

    return users.filter((user) => this.isEligibleCandidate(user));
  }

  private isEligibleCandidate(candidate: LegacyCandidate): boolean {
    if (!LEGACY_SEQUENCE_PATTERN.test(candidate.username)) {
      return false;
    }

    if (Number(candidate.username) < LEGACY_SEQUENCE_START) {
      return false;
    }

    return candidate.auditLogs.some((auditLog) => {
      if (auditLog.entityId !== candidate.id || !isRecord(auditLog.metadata)) {
        return false;
      }

      return (
        auditLog.metadata.source === 'SELF_REGISTRATION' &&
        auditLog.metadata.generatedUsername === true
      );
    });
  }

  private async allocateUsername(
    transaction: Prisma.TransactionClient,
  ): Promise<string> {
    for (
      let attempt = 0;
      attempt < PUBLIC_USERNAME_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const candidate = createRandomPublicUsername();
      const existing = await transaction.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });

      if (!existing) {
        return candidate;
      }
    }

    throw new BadRequestException(
      'Unable to allocate a unique replacement username. Retry the migration.',
    );
  }
}
