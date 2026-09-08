import type { AuthenticatedUser } from '../auth/auth-user';
import type { CommissionsService } from '../commissions/commissions.service';
import type { InternalTradingLifecycleService } from '../internal-trading/internal-trading-lifecycle.service';
import type { RewardsService } from '../rewards/rewards.service';
import { SubscriptionPostActivationService } from './subscription-post-activation.service';

const actor: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

const SUBSCRIPTION_ID = '11111111-1111-4111-8111-111111111111';

describe('SubscriptionPostActivationService', () => {
  const commissionsService = {
    processSubscriptionSafely: jest.fn(),
  };

  const rewardsService = {
    reconcileSubscription: jest.fn(),
  };

  const internalTradingLifecycleService = {
    initializeActivatedSubscription: jest.fn(),
    getEarningAuthority: jest.fn(),
  };

  let service: SubscriptionPostActivationService;

  beforeEach(() => {
    jest.clearAllMocks();

    commissionsService.processSubscriptionSafely.mockResolvedValue({
      processingStatus: 'PROCESSED',
      created: true,
      run: {
        id: 'commission-run-id',
        outcome: 'PROCESSED',
      },
      events: [],
    });

    internalTradingLifecycleService.initializeActivatedSubscription.mockResolvedValue(
      {
        initialized: false,
        created: false,
        earningAuthority: 'LEGACY_REWARD',
        state: null,
      },
    );

    internalTradingLifecycleService.getEarningAuthority.mockResolvedValue(
      'LEGACY_REWARD',
    );

    rewardsService.reconcileSubscription.mockResolvedValue({
      initialized: true,
      noEffectivePolicy: false,
      events: [],
      state: {
        subscriptionId: SUBSCRIPTION_ID,
        status: 'ACTIVE',
      },
      catchupLimitReached: false,
      message: 'No package reward is due yet.',
    });

    service = new SubscriptionPostActivationService(
      commissionsService as unknown as CommissionsService,
      rewardsService as unknown as RewardsService,
      internalTradingLifecycleService as unknown as InternalTradingLifecycleService,
    );
  });

  it('keeps LEGACY_REWARD subscriptions on RWD-01', async () => {
    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(
      internalTradingLifecycleService.initializeActivatedSubscription,
    ).toHaveBeenCalled();

    expect(rewardsService.reconcileSubscription).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      actor,
      {},
    );

    expect(result).toMatchObject({
      internalTradingPendingReason: null,
      rewardLifecyclePendingReason: null,
      rewardLifecycleSkippedReason: null,
      downstreamPending: false,
    });
  });

  it('prevents RWD-01 double-credit for INTERNAL_TRADING packages', async () => {
    internalTradingLifecycleService.initializeActivatedSubscription.mockResolvedValue(
      {
        initialized: true,
        created: true,
        earningAuthority: 'INTERNAL_TRADING',
        state: {
          subscriptionId: SUBSCRIPTION_ID,
          status: 'ACTIVE',
        },
      },
    );

    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(rewardsService.reconcileSubscription).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      rewardLifecycle: null,
      rewardLifecyclePendingReason: null,
      downstreamPending: false,
      internalTradingLifecycle: {
        earningAuthority: 'INTERNAL_TRADING',
      },
    });

    expect(result.rewardLifecycleSkippedReason).toContain('INTERNAL_TRADING');
  });

  it('does not fall through to rewards when ITD initialization fails but authority is INTERNAL_TRADING', async () => {
    internalTradingLifecycleService.initializeActivatedSubscription.mockRejectedValue(
      new Error('ITD state temporarily unavailable'),
    );

    internalTradingLifecycleService.getEarningAuthority.mockResolvedValue(
      'INTERNAL_TRADING',
    );

    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(rewardsService.reconcileSubscription).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      internalTradingLifecycle: null,
      internalTradingPendingReason: 'ITD state temporarily unavailable',
      rewardLifecyclePendingReason: null,
      downstreamPending: true,
    });
  });

  it('preserves reward recovery for LEGACY_REWARD subscriptions', async () => {
    rewardsService.reconcileSubscription.mockRejectedValue(
      new Error('Reward state temporarily unavailable'),
    );

    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(result).toMatchObject({
      rewardLifecycle: null,
      rewardLifecyclePendingReason: 'Reward state temporarily unavailable',
      downstreamPending: true,
    });
  });
});
