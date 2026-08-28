import 'reflect-metadata';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { RewardsService } from './rewards.service';

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

const draftPolicy = {
  id: '11111111-1111-4111-8111-111111111111',
  versionNumber: 1,
  status: 'DRAFT',
  revision: 1,
  existingSubscriptionRolloutMode: 'FORWARD_ONLY_FROM_POLICY_EFFECTIVE',
  packageRewardCountsTowardCap: true,
  referralCommissionCountsTowardCap: false,
  teamCommissionCountsTowardCap: false,
  awardRewardCountsTowardCap: false,
  otherIncomeCountsTowardCap: false,
  effectiveFrom: null,
  effectiveTo: null,
  publishedAt: null,
  clonedFromPolicyVersionId: null,
  createdByUserId: actor.id,
  updatedByUserId: actor.id,
  publishedByUserId: null,
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
  updatedAt: new Date('2026-08-27T00:00:00.000Z'),
};

const publishedPolicy = {
  ...draftPolicy,
  status: 'PUBLISHED',
  revision: 2,
  effectiveFrom: new Date('2026-08-28T00:00:00.000Z'),
  publishedAt: new Date('2026-08-28T00:00:00.000Z'),
  publishedByUserId: actor.id,
};

const subscription = {
  id: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
  packagePlanVersionId: '55555555-5555-4555-8555-555555555555',
  packagePlanItemId: '66666666-6666-4666-8666-666666666666',
  packageCode: 'NEURAL-SCOUT',
  packageDisplayName: 'Neural Scout',
  price: '100.00000000',
  currency: 'USDT',
  settlementTimezone: 'UTC',
  rewardRateMode: 'FIXED',
  fixedRewardRate: '1.000000',
  minimumRewardRate: null,
  maximumRewardRate: null,
  rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
  capBasis: 'TOTAL_RETURN',
  capMultiplier: '3.0000',
  principalTreatment: 'INCLUDED_IN_TOTAL_RETURN',
  goalDays: 120,
  cycleDays: 30,
  rewardStartMode: 'NEXT_CALENDAR_DAY',
  rewardFrequency: 'DAILY_CALENDAR',
  cycleDayMode: 'CALENDAR_DAYS',
  rewardDayMode: 'EVERY_DAY',
  cycleEndAction: 'AUTO_START_NEXT_CYCLE',
  capReachedAction: 'COMPLETE_PACKAGE',
  status: 'ACTIVE',
  activatedAt: new Date('2026-08-20T00:00:00.000Z'),
  scheduledEndAt: new Date('2026-12-18T00:00:00.000Z'),
  completedAt: null,
};

const forwardOnlyState = {
  subscriptionId: subscription.id,
  userId: subscription.userId,
  rewardCapPolicyVersionId: publishedPolicy.id,
  currency: subscription.currency,
  packageValue: subscription.price,
  capBasis: subscription.capBasis,
  capMultiplier: subscription.capMultiplier,
  principalTreatment: subscription.principalTreatment,
  capLimit: '300.00000000',
  capConsumed: '100.00000000',
  packageRewardCountsTowardCap: true,
  referralCommissionCountsTowardCap: false,
  teamCommissionCountsTowardCap: false,
  awardRewardCountsTowardCap: false,
  otherIncomeCountsTowardCap: false,
  nextRewardLocalDate: '2026-08-29',
  nextRewardAt: new Date('2026-08-29T00:00:00.000Z'),
  nextRewardDayNumber: 9,
  nextCycleNumber: 1,
  nextCycleDay: 9,
  settledRewardCount: 0,
  status: 'ACTIVE',
  completionReason: null,
  blockedReason: null,
  revision: 1,
  completedAt: null,
  createdAt: new Date('2026-08-28T12:00:00.000Z'),
  updatedAt: new Date('2026-08-28T12:00:00.000Z'),
};

const expenseAccount = {
  id: '77777777-7777-4777-8777-777777777777',
  accountKey: 'SYSTEM:PACKAGE_REWARD_EXPENSE:USDT',
  ownerType: 'SYSTEM',
  ownerUserId: null,
  bucket: 'PACKAGE_REWARD_EXPENSE',
  currency: 'USDT',
  normalSide: 'DEBIT',
};

const earningsAccount = {
  id: '88888888-8888-4888-8888-888888888888',
  accountKey: `USER:${subscription.userId}:PACKAGE_EARNINGS:USDT`,
  ownerType: 'USER',
  ownerUserId: subscription.userId,
  bucket: 'PACKAGE_EARNINGS',
  currency: 'USDT',
  normalSide: 'CREDIT',
};

function rewardEventFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    sourceKey: `SUBSCRIPTION:${subscription.id}:PACKAGE_REWARD:2026-08-29`,
    subscriptionId: subscription.id,
    userId: subscription.userId,
    rewardCapPolicyVersionId: publishedPolicy.id,
    packagePlanVersionId: subscription.packagePlanVersionId,
    packagePlanItemId: subscription.packagePlanItemId,
    packageCode: subscription.packageCode,
    packageDisplayName: subscription.packageDisplayName,
    packageValue: subscription.price,
    currency: subscription.currency,
    rewardLocalDate: '2026-08-29',
    rewardDayNumber: 9,
    cycleNumber: 1,
    cycleDay: 9,
    settlementTimezone: subscription.settlementTimezone,
    rewardStartMode: subscription.rewardStartMode,
    rewardFrequency: subscription.rewardFrequency,
    cycleDayMode: subscription.cycleDayMode,
    rewardDayMode: subscription.rewardDayMode,
    rewardRateMode: subscription.rewardRateMode,
    rewardRateMeaning: subscription.rewardRateMeaning,
    selectedRate: '1.000000',
    calculatedReward: '1.00000000',
    postedReward: '1.00000000',
    capBasis: subscription.capBasis,
    capMultiplier: subscription.capMultiplier,
    principalTreatment: subscription.principalTreatment,
    capLimit: '300.00000000',
    capConsumedBefore: '100.00000000',
    capConsumedAfter: '101.00000000',
    clippedToCap: false,
    existingSubscriptionRolloutMode:
      publishedPolicy.existingSubscriptionRolloutMode,
    packageRewardCountsTowardCap: true,
    referralCommissionCountsTowardCap: false,
    teamCommissionCountsTowardCap: false,
    awardRewardCountsTowardCap: false,
    otherIncomeCountsTowardCap: false,
    cycleDays: subscription.cycleDays,
    goalDays: subscription.goalDays,
    cycleEndAction: subscription.cycleEndAction,
    capReachedAction: subscription.capReachedAction,
    ledgerTransactionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    completionReason: null,
    postedAt: new Date('2026-08-29T12:00:00.000Z'),
    createdAt: new Date('2026-08-29T12:00:00.000Z'),
    ...overrides,
  };
}

type TransactionWork = (
  transaction: Prisma.TransactionClient,
) => Promise<unknown>;

function serviceWithTransaction(
  queryResults: unknown[][],
  executeResults: number[] = [],
) {
  const queryRaw = jest.fn();
  for (const result of queryResults) queryRaw.mockResolvedValueOnce(result);

  const executeRaw = jest.fn();
  for (const result of executeResults) executeRaw.mockResolvedValueOnce(result);
  executeRaw.mockResolvedValue(1);

  const transaction = {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((work: TransactionWork) =>
      work(transaction as unknown as Prisma.TransactionClient),
    ),
  };

  return {
    service: new RewardsService(prisma as unknown as PrismaService),
    transaction,
  };
}

describe('RewardsService RWD-01 boundaries', () => {
  it.each([
    [
      'retroactive rollout',
      {
        existingSubscriptionRolloutMode:
          'RETROACTIVE_FROM_SUBSCRIPTION_SCHEDULE',
      },
    ],
    [
      'package reward excluded from cap',
      { packageRewardCountsTowardCap: false },
    ],
    [
      'referral commission included in cap',
      { referralCommissionCountsTowardCap: true },
    ],
    [
      'team commission included in cap',
      { teamCommissionCountsTowardCap: true },
    ],
    ['award reward included in cap', { awardRewardCountsTowardCap: true }],
    ['other income included in cap', { otherIncomeCountsTowardCap: true }],
  ])(
    'fails closed at publication when %s requires a deferred engine',
    async (_label, patch) => {
      const { service, transaction } = serviceWithTransaction([
        [{ ...draftPolicy, ...patch }],
      ]);

      await expect(
        service.publishPolicy(
          draftPolicy.id,
          {
            expectedRevision: 1,
            reason: 'Founder reviewed RWD-01 policy.',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction.$executeRaw).not.toHaveBeenCalled();
      expect(transaction.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it('rejects backdated reward policy publication before any financial configuration write', async () => {
    const { service, transaction } = serviceWithTransaction([[draftPolicy]]);

    await expect(
      service.publishPolicy(
        draftPolicy.id,
        {
          expectedRevision: 1,
          effectiveFrom: '2026-08-01T00:00:00.000Z',
          reason: 'Backdate must fail.',
        },
        actor,
      ),
    ).rejects.toThrow('Reward/cap policy effectiveFrom cannot be backdated.');

    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('initializes an existing ACTIVE subscription forward-only from policy effective date without backfill', async () => {
    const asOf = new Date('2026-08-28T12:00:00.000Z');
    const { service, transaction } = serviceWithTransaction([
      [subscription],
      [],
      [],
      [publishedPolicy],
      [forwardOnlyState],
    ]);

    const result = await service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );

    expect(result.initialized).toBe(true);
    expect(result.noEffectivePolicy).toBe(false);
    expect(result.events).toHaveLength(0);
    expect(result.state).toMatchObject({
      status: 'ACTIVE',
      nextRewardLocalDate: '2026-08-29',
      nextRewardDayNumber: 9,
      nextCycleNumber: 1,
      nextCycleDay: 9,
      capLimit: '300.00000000',
      capConsumed: '100.00000000',
    });
    expect(result.message).toContain('No package reward is due before');
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('persists unsupported subscription terms as BLOCKED instead of posting a reward', async () => {
    const asOf = new Date('2026-08-28T12:00:00.000Z');
    const unsupported = {
      ...subscription,
      rewardRateMode: 'MANUAL',
    };
    const blockedState = {
      ...forwardOnlyState,
      status: 'BLOCKED',
      blockedReason: 'UNSUPPORTED_RATE_MODE:MANUAL',
    };
    const { service, transaction } = serviceWithTransaction([
      [unsupported],
      [],
      [],
      [publishedPolicy],
      [blockedState],
    ]);

    const result = await service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );

    expect(result.events).toHaveLength(0);
    expect(result.state).toMatchObject({
      status: 'BLOCKED',
      blockedReason: 'UNSUPPORTED_RATE_MODE:MANUAL',
    });
    expect(result.message).toContain('Reward processing is blocked');
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('returns an explicit no-effective-policy state instead of creating reward accounting', async () => {
    const asOf = new Date('2026-08-27T12:00:00.000Z');
    const { service, transaction } = serviceWithTransaction([
      [subscription],
      [],
      [],
      [],
    ]);

    const result = await service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );

    expect(result).toMatchObject({
      initialized: false,
      noEffectivePolicy: true,
      events: [],
      state: null,
    });
    expect(result.message).toContain('No published reward/cap policy');
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('posts a fixed package reward through a balanced ledger and advances cap state', async () => {
    const asOf = new Date('2026-08-29T12:00:00.000Z');
    const nextState = {
      ...forwardOnlyState,
      capConsumed: '101.00000000',
      nextRewardLocalDate: '2026-08-30',
      nextRewardAt: new Date('2026-08-30T00:00:00.000Z'),
      nextRewardDayNumber: 10,
      nextCycleNumber: 1,
      nextCycleDay: 10,
      settledRewardCount: 1,
      revision: 2,
    };
    const event = rewardEventFixture();
    const { service, transaction } = serviceWithTransaction([
      [subscription],
      [forwardOnlyState],
      [subscription],
      [forwardOnlyState],
      [publishedPolicy],
      [],
      [expenseAccount],
      [earningsAccount],
      [
        { side: 'DEBIT', amount: '1.00000000' },
        { side: 'CREDIT', amount: '1.00000000' },
      ],
      [event],
      [nextState],
    ]);

    const result = await service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      selectedRate: '1.000000',
      calculatedReward: '1.00000000',
      postedReward: '1.00000000',
      capConsumedBefore: '100.00000000',
      capConsumedAfter: '101.00000000',
      clippedToCap: false,
      completionReason: null,
    });
    expect(result.state).toMatchObject({
      status: 'ACTIVE',
      capConsumed: '101.00000000',
      settledRewardCount: 1,
      nextRewardLocalDate: '2026-08-30',
      nextRewardDayNumber: 10,
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('clips the final reward exactly to remaining cap headroom and completes the package', async () => {
    const asOf = new Date('2026-08-29T12:00:00.000Z');
    const capEdgeState = {
      ...forwardOnlyState,
      capConsumed: '299.50000000',
    };
    const completedState = {
      ...capEdgeState,
      capConsumed: '300.00000000',
      settledRewardCount: 1,
      status: 'COMPLETED',
      completionReason: 'CAP_REACHED',
      revision: 2,
      completedAt: asOf,
    };
    const event = rewardEventFixture({
      postedReward: '0.50000000',
      capConsumedBefore: '299.50000000',
      capConsumedAfter: '300.00000000',
      clippedToCap: true,
      completionReason: 'CAP_REACHED',
    });
    const { service } = serviceWithTransaction([
      [subscription],
      [capEdgeState],
      [subscription],
      [capEdgeState],
      [publishedPolicy],
      [],
      [expenseAccount],
      [earningsAccount],
      [
        { side: 'DEBIT', amount: '0.50000000' },
        { side: 'CREDIT', amount: '0.50000000' },
      ],
      [event],
      [completedState],
    ]);

    const result = await service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );

    expect(result.events[0]).toMatchObject({
      calculatedReward: '1.00000000',
      postedReward: '0.50000000',
      capConsumedBefore: '299.50000000',
      capConsumedAfter: '300.00000000',
      clippedToCap: true,
      completionReason: 'CAP_REACHED',
    });
    expect(result.state).toMatchObject({
      status: 'COMPLETED',
      completionReason: 'CAP_REACHED',
      capConsumed: '300.00000000',
      settledRewardCount: 1,
    });
  });

  it('posts the goal-day reward once and then completes the lifecycle at lifetime boundary', async () => {
    const asOf = new Date('2026-12-18T12:00:00.000Z');
    const lifetimeState = {
      ...forwardOnlyState,
      nextRewardLocalDate: '2026-12-18',
      nextRewardAt: new Date('2026-12-18T00:00:00.000Z'),
      nextRewardDayNumber: 120,
      nextCycleNumber: 4,
      nextCycleDay: 30,
      capConsumed: '150.00000000',
      settledRewardCount: 111,
      revision: 12,
    };
    const completedState = {
      ...lifetimeState,
      capConsumed: '151.00000000',
      settledRewardCount: 112,
      status: 'COMPLETED',
      completionReason: 'LIFETIME_REACHED',
      revision: 13,
      completedAt: asOf,
    };
    const event = rewardEventFixture({
      sourceKey: `SUBSCRIPTION:${subscription.id}:PACKAGE_REWARD:2026-12-18`,
      rewardLocalDate: '2026-12-18',
      rewardDayNumber: 120,
      cycleNumber: 4,
      cycleDay: 30,
      capConsumedBefore: '150.00000000',
      capConsumedAfter: '151.00000000',
      completionReason: 'LIFETIME_REACHED',
      postedAt: asOf,
      createdAt: asOf,
    });
    const { service } = serviceWithTransaction([
      [subscription],
      [lifetimeState],
      [subscription],
      [lifetimeState],
      [publishedPolicy],
      [],
      [expenseAccount],
      [earningsAccount],
      [
        { side: 'DEBIT', amount: '1.00000000' },
        { side: 'CREDIT', amount: '1.00000000' },
      ],
      [event],
      [completedState],
    ]);

    const result = await service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      rewardDayNumber: 120,
      cycleNumber: 4,
      cycleDay: 30,
      postedReward: '1.00000000',
      completionReason: 'LIFETIME_REACHED',
    });
    expect(result.state).toMatchObject({
      status: 'COMPLETED',
      completionReason: 'LIFETIME_REACHED',
      capConsumed: '151.00000000',
      settledRewardCount: 112,
    });
  });

  it('fails closed when an immutable reward event already exists for the state reward day', async () => {
    const asOf = new Date('2026-08-29T12:00:00.000Z');
    const existingEvent = rewardEventFixture();
    const { service, transaction } = serviceWithTransaction([
      [subscription],
      [forwardOnlyState],
      [subscription],
      [forwardOnlyState],
      [publishedPolicy],
      [existingEvent],
    ]);

    const processing = service.processSubscriptionDue(
      subscription.id,
      asOf,
      actor,
    );
    await expect(processing).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(processing).rejects.toThrow(
      'Reward event exists while lifecycle state still targets the same reward day; reconciliation requires investigation.',
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('stops before immutable reward event creation when ledger balance verification fails', async () => {
    const asOf = new Date('2026-08-29T12:00:00.000Z');
    const { service, transaction } = serviceWithTransaction([
      [subscription],
      [forwardOnlyState],
      [subscription],
      [forwardOnlyState],
      [publishedPolicy],
      [],
      [expenseAccount],
      [earningsAccount],
      [{ side: 'DEBIT', amount: '1.00000000' }],
    ]);

    await expect(
      service.processSubscriptionDue(subscription.id, asOf, actor),
    ).rejects.toThrow('Package reward ledger transaction is not balanced.');
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
