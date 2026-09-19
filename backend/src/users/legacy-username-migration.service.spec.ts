import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import * as publicUsernameUtil from '../auth/public-username.util';
import { PrismaService } from '../database/prisma.service';
import {
  LEGACY_USERNAME_MIGRATION_CONFIRMATION,
  LegacyUsernameMigrationService,
} from './legacy-username-migration.service';

describe('LegacyUsernameMigrationService', () => {
  const actor: AuthenticatedUser = {
    id: 'super-admin-id',
    email: 'founder@example.com',
    username: '100001',
    phone: null,
    firstName: 'Founder',
    lastName: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    lastLoginAt: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
  };

  const generatedCandidate = {
    id: 'generated-user-id',
    email: 'generated@example.com',
    username: '100002',
    createdAt: new Date('2026-09-18T00:00:00.000Z'),
    auditLogs: [
      {
        entityId: 'generated-user-id',
        metadata: {
          source: 'SELF_REGISTRATION',
          generatedUsername: true,
        },
      },
    ],
  };

  const manualNumericCandidate = {
    id: 'manual-user-id',
    email: 'manual@example.com',
    username: '123456',
    createdAt: new Date('2026-09-18T01:00:00.000Z'),
    auditLogs: [
      {
        entityId: 'manual-user-id',
        metadata: {
          source: 'SELF_REGISTRATION',
          generatedUsername: false,
        },
      },
    ],
  };

  const transaction = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: LegacyUsernameMigrationService;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    transaction.user.findMany.mockResolvedValue([
      generatedCandidate,
      manualNumericCandidate,
    ]);
    transaction.user.findUnique.mockResolvedValue(null);
    transaction.user.update.mockResolvedValue({ id: generatedCandidate.id });
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });
    jest
      .spyOn(publicUsernameUtil, 'createRandomPublicUsername')
      .mockReturnValue('k7m2x9q4');

    service = new LegacyUsernameMigrationService(
      prisma as unknown as PrismaService,
    );
  });

  it('previews only audited system-generated sequential usernames', async () => {
    await expect(service.preview()).resolves.toEqual({
      count: 1,
      candidates: [
        {
          id: generatedCandidate.id,
          email: generatedCandidate.email,
          username: generatedCandidate.username,
          createdAt: generatedCandidate.createdAt,
        },
      ],
    });
  });

  it('requires the explicit migration confirmation token', async () => {
    await expect(service.execute('NO', actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('migrates eligible usernames and records an audit entry', async () => {
    const result = await service.execute(
      LEGACY_USERNAME_MIGRATION_CONFIRMATION,
      actor,
      { ipAddress: '127.0.0.1', userAgent: 'Jest' },
    );

    expect(transaction.user.update).toHaveBeenCalledTimes(1);
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: generatedCandidate.id },
      data: { username: 'k7m2x9q4' },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: actor.id,
        action: 'UPDATE',
        entityType: 'User',
        entityId: generatedCandidate.id,
        description:
          'SUPER_ADMIN migrated a legacy system-generated username.',
        metadata: {
          source: 'LEGACY_PUBLIC_USERNAME_MIGRATION',
          previousUsername: '100002',
          newUsername: 'k7m2x9q4',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });
    expect(result).toEqual({
      message: 'Legacy generated usernames migrated successfully.',
      migratedCount: 1,
      migrated: [
        {
          id: generatedCandidate.id,
          email: generatedCandidate.email,
          previousUsername: '100002',
          username: 'k7m2x9q4',
        },
      ],
    });
  });
});
