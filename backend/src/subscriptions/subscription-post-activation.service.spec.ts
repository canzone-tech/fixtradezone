import type { AuthenticatedUser } from '../auth/auth-user';
import type { CommissionsService } from '../commissions/commissions.service';
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

  let service: SubscriptionPostActivationService;

  beforeEach(() => {
    jest.clearAllMocks();
    commissionsService.processSubscriptionSafely.mockResolvedValue({
      processingStatus: 'PROCESSED',
      created: true,
      run: { id: 'commission-run-id', outcome: 'PROCESSED' },
      events: [],
    });
    rewardsService.reconcileSubscription.mockResolvedValue({
      initialized: true,
      noEffectivePolicy: false,
      events: [],
      state: { subscriptionId: SUBSCRIPTION_ID, status: 'ACTIVE' },
      catchupLimitReached: false,
      message: 'No package reward is due yet.',
    });

    service = new SubscriptionPostActivationService(
      commissionsService as unknown as CommissionsService,
      rewardsService as unknown as RewardsService,
    );
  });

  it('runs commission and reward lifecycle through one shared post-activation path', async () => {
    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(commissionsService.processSubscriptionSafely).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      actor,
      {},
    );
    expect(rewardsService.reconcileSubscription).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      actor,
      {},
    );
    expect(result).toMatchObject({
      referralCommissionPendingReason: null,
      rewardLifecyclePendingReason: null,
      downstreamPending: false,
      referralCommission: { processingStatus: 'PROCESSED' },
      rewardLifecycle: {
        initialized: true,
        noEffectivePolicy: false,
        state: { subscriptionId: SUBSCRIPTION_ID, status: 'ACTIVE' },
      },
    });
  });

  it('preserves independent recovery state when downstream stages are pending', async () => {
    commissionsService.processSubscriptionSafely.mockResolvedValue({
      processingStatus: 'PENDING_RECONCILIATION',
      message: 'Commission plan requires reconciliation.',
    });
    rewardsService.reconcileSubscription.mockRejectedValue(
      new Error('Reward state temporarily unavailable'),
    );

    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(result).toMatchObject({
      referralCommissionPendingReason:
        'Commission plan requires reconciliation.',
      rewardLifecycle: null,
      rewardLifecyclePendingReason: 'Reward state temporarily unavailable',
      downstreamPending: true,
    });
  });

  it('marks a missing effective reward policy as recoverable without failing activation', async () => {
    rewardsService.reconcileSubscription.mockResolvedValue({
      initialized: false,
      noEffectivePolicy: true,
      events: [],
      state: null,
      message: 'No published reward/cap policy applies to this subscription yet.',
    });

    const result = await service.process(SUBSCRIPTION_ID, actor);

    expect(result.rewardLifecyclePendingReason).toBe(
      'No published reward/cap policy applies to this subscription yet.',
    );
    expect(result.downstreamPending).toBe(true);
  });
});
