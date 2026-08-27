import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { referralCommissionSourceKey } from '../wallet/wallet.constants';
import { CommissionsService } from './commissions.service';

const actor: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

const draftPlan = {
  id: '11111111-1111-4111-8111-111111111111',
  versionNumber: 1,
  status: 'DRAFT',
  revision: 1,
  firstPurchaseEnabled: true,
  newPurchaseEnabled: true,
  renewalEnabled: false,
  upgradeEnabled: false,
  upgradeBaseMode: 'INCREMENTAL',
  activePackageRequired: true,
  inactiveUplineAction: 'LOST',
  compressionMode: 'SKIP',
  releaseMode: 'IMMEDIATE',
  holdPeriodHours: 0,
  effectiveFrom: null,
  effectiveTo: null,
  publishedAt: null,
  clonedFromPlanVersionId: null,
  createdByUserId: actor.id,
  updatedByUserId: actor.id,
  publishedByUserId: null,
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
  updatedAt: new Date('2026-08-27T00:00:00.000Z'),
};

const levels = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    planVersionId: draftPlan.id,
    level: 1,
    enabled: true,
    ratePercent: '20.000000',
    packageMatchingEnabled: true,
    createdAt: new Date('2026-08-27T00:00:00.000Z'),
    updatedAt: new Date('2026-08-27T00:00:00.000Z'),
  },
];

type TransactionWork = (
  transaction: Prisma.TransactionClient,
) => Promise<unknown>;

function publicationService(planPatch: Record<string, unknown> = {}) {
  const transaction = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ ...draftPlan, ...planPatch }])
      .mockResolvedValueOnce(levels),
    $executeRaw: jest.fn(),
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((work: TransactionWork) =>
      work(transaction as unknown as Prisma.TransactionClient),
    ),
  };

  return {
    service: new CommissionsService(prisma as unknown as PrismaService),
    transaction,
  };
}

describe('CommissionsService', () => {
  it.each([
    ['inactive-upline pending', { inactiveUplineAction: 'PENDING' }],
    ['pass-up', { inactiveUplineAction: 'PASS_UP' }],
    ['level compression', { compressionMode: 'COMPRESS_LEVELS' }],
    ['hold release', { releaseMode: 'HOLD_PERIOD', holdPeriodHours: 24 }],
    ['manual release', { releaseMode: 'MANUAL_APPROVAL' }],
  ])(
    'fails closed at publication when %s requires a deferred engine',
    async (_label, patch) => {
      const { service, transaction } = publicationService(patch);

      await expect(
        service.publishPlan(
          draftPlan.id,
          {
            expectedRevision: 1,
            reason: 'Founder reviewed COMM-01 plan.',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.$executeRaw).not.toHaveBeenCalled();
    },
  );

  it('rejects package matching when active-package qualification is disabled', async () => {
    const { service, transaction } = publicationService({
      activePackageRequired: false,
    });

    await expect(
      service.publishPlan(
        draftPlan.id,
        {
          expectedRevision: 1,
          reason: 'Founder reviewed COMM-01 plan.',
        },
        actor,
      ),
    ).rejects.toThrow(
      'Package matching requires active-package qualification.',
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });

  it('builds deterministic per-level commission source keys', () => {
    expect(
      referralCommissionSourceKey(
        '11111111-1111-4111-8111-111111111111',
        3,
        '33333333-3333-4333-8333-333333333333',
      ),
    ).toBe(
      'SUBSCRIPTION:11111111-1111-4111-8111-111111111111:REFERRAL_COMMISSION:L3:33333333-3333-4333-8333-333333333333',
    );
  });

  it.each([
    new ConflictException('retry later'),
    new ServiceUnavailableException('route needs investigation'),
  ])(
    'returns reconciliation state for recoverable commission failures',
    async (error) => {
      const service = new CommissionsService({} as PrismaService);
      jest.spyOn(service, 'processSubscription').mockRejectedValueOnce(error);

      await expect(
        service.processSubscriptionSafely(
          '11111111-1111-4111-8111-111111111111',
          actor,
        ),
      ).resolves.toMatchObject({
        processingStatus: 'PENDING_RECONCILIATION',
      });
    },
  );

  it('does not hide non-recoverable validation failures', async () => {
    const service = new CommissionsService({} as PrismaService);
    jest
      .spyOn(service, 'processSubscription')
      .mockRejectedValueOnce(new BadRequestException('invalid source state'));

    await expect(
      service.processSubscriptionSafely(
        '11111111-1111-4111-8111-111111111111',
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
