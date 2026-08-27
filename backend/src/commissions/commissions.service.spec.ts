import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
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

type PlanValidationInput = {
  firstPurchaseEnabled: boolean;
  newPurchaseEnabled: boolean;
  renewalEnabled: boolean;
  upgradeEnabled: boolean;
  upgradeBaseMode: 'FULL' | 'INCREMENTAL';
  activePackageRequired: boolean;
  inactiveUplineAction: 'LOST' | 'PENDING' | 'PASS_UP';
  compressionMode: 'SKIP' | 'PASS_SAME_LEVEL' | 'COMPRESS_LEVELS' | 'PENDING';
  releaseMode: 'IMMEDIATE' | 'HOLD_PERIOD' | 'MANUAL_APPROVAL' | 'CONDITION_BASED';
  holdPeriodHours: number;
};

type TestableService = CommissionsService & {
  validatePlanConfiguration: (
    plan: PlanValidationInput,
    levels: Array<{
      level: number;
      enabled: boolean;
      ratePercent: string;
      packageMatchingEnabled: boolean;
    }>,
    forPublication: boolean,
  ) => void;
};

function executablePlan(): PlanValidationInput {
  return {
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
  };
}

const levels = [
  {
    level: 1,
    enabled: true,
    ratePercent: '20.000000',
    packageMatchingEnabled: true,
  },
  {
    level: 2,
    enabled: true,
    ratePercent: '8.000000',
    packageMatchingEnabled: true,
  },
];

describe('CommissionsService', () => {
  const service = new CommissionsService({} as PrismaService);
  const testable = service as TestableService;

  it('accepts only the initial executable LOST + SKIP + IMMEDIATE publication policy', () => {
    expect(() =>
      testable.validatePlanConfiguration(executablePlan(), levels, true),
    ).not.toThrow();
  });

  it.each([
    ['inactive-upline pending', { inactiveUplineAction: 'PENDING' as const }],
    ['pass-up', { inactiveUplineAction: 'PASS_UP' as const }],
    ['level compression', { compressionMode: 'COMPRESS_LEVELS' as const }],
    ['hold release', { releaseMode: 'HOLD_PERIOD' as const, holdPeriodHours: 24 }],
    ['manual release', { releaseMode: 'MANUAL_APPROVAL' as const }],
  ])('fails closed when %s requires a deferred engine', (_label, patch) => {
    expect(() =>
      testable.validatePlanConfiguration(
        { ...executablePlan(), ...patch },
        levels,
        true,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects matching when active-package qualification is disabled', () => {
    expect(() =>
      testable.validatePlanConfiguration(
        { ...executablePlan(), activePackageRequired: false },
        levels,
        false,
      ),
    ).toThrow('Package matching requires active-package qualification.');
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
  ])('returns reconciliation state for recoverable commission failures', async (error) => {
    jest.spyOn(service, 'processSubscription').mockRejectedValueOnce(error);

    await expect(
      service.processSubscriptionSafely(
        '11111111-1111-4111-8111-111111111111',
        actor,
      ),
    ).resolves.toMatchObject({
      processingStatus: 'PENDING_RECONCILIATION',
    });
  });

  it('does not hide non-recoverable validation failures', async () => {
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
