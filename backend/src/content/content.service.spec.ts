import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_EMAIL_CONTENT,
  DEFAULT_LANDING_CONTENT,
} from './content.defaults';
import { ContentService } from './content.service';

describe('ContentService', () => {
  const actor = {
    id: '00000000-0000-4000-8000-000000000001',
  } as AuthenticatedUser;

  it('returns the code-versioned landing fallback when nothing is published', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new ContentService(prisma);

    await expect(service.getPublicLanding()).resolves.toEqual({
      templateKey: 'DARK_NEO_V1',
      revision: null,
      content: DEFAULT_LANDING_CONTENT,
      source: 'DEFAULT',
    });
  });

  it('rejects unsafe landing CTA schemes before opening a transaction', async () => {
    const transaction = jest.fn();
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const service = new ContentService(prisma);

    await expect(
      service.createLandingDraft(
        {
          ...DEFAULT_LANDING_CONTENT,
          primaryCtaHref: 'javascript:alert(1)',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects unapproved email-template variables before opening a transaction', async () => {
    const transaction = jest.fn();
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const service = new ContentService(prisma);

    await expect(
      service.createEmailTemplateDraft(
        'EMAIL_VERIFICATION',
        {
          ...DEFAULT_EMAIL_CONTENT.EMAIL_VERIFICATION,
          body: 'Hello {{displayName}}. Secret: {{passwordHash}}',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('can repoint the current publication to an immutable published revision', async () => {
    const publishedRevision = {
      id: '00000000-0000-4000-8000-000000000099',
      contentKey: 'LANDING_PAGE',
      version: 2,
      status: 'PUBLISHED',
      templateKey: 'DARK_NEO_V1',
      payload: DEFAULT_LANDING_CONTENT,
      createdByUserId: actor.id,
      publishedByUserId: actor.id,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      publishedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([publishedRevision])
      .mockResolvedValueOnce([publishedRevision]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const auditCreate = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      auditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    } as unknown as PrismaService;
    const service = new ContentService(prisma);

    const result = await service.publishLanding(
      publishedRevision.id,
      actor,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.message).toBe(
      'Current publication moved to the selected published revision.',
    );
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
