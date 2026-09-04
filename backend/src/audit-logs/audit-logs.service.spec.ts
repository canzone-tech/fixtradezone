import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { AuditLogsService } from './audit-logs.service';

function prismaMock() {
  return {
    $queryRaw: jest.fn(),
  };
}

describe('AuditLogsService', () => {
  it('returns a paginated immutable audit view', async () => {
    const prisma = prismaMock();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'audit-1',
          actorUserId: '1944e7e2-e40c-48bc-8bc1-00f9783a2fe5',
          action: 'UPDATE',
          entityType: 'SystemSecurityConfig',
          entityId: '1',
          description: 'Security configuration updated.',
          metadata: '{"source":"ADMIN"}',
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          createdAt: new Date('2026-09-04T10:00:00.000Z'),
          actorUsername: 'superadmin',
          actorEmail: 'superadmin@fixtradezone.com',
        },
      ])
      .mockResolvedValueOnce([{ total: 1n }]);

    const service = new AuditLogsService(prisma as unknown as PrismaService);

    await expect(service.list({ page: 1, limit: 50 })).resolves.toMatchObject({
      page: 1,
      limit: 50,
      total: 1,
      auditLogs: [
        {
          id: 'audit-1',
          action: 'UPDATE',
          metadata: { source: 'ADMIN' },
          actor: {
            username: 'superadmin',
          },
        },
      ],
    });
  });

  it('rejects an invalid date window before querying the database', async () => {
    const prisma = prismaMock();
    const service = new AuditLogsService(prisma as unknown as PrismaService);

    await expect(
      service.list({
        page: 1,
        limit: 50,
        from: '2026-09-05T00:00:00.000Z',
        to: '2026-09-04T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
