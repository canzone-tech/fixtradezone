import type { AuthenticatedUser } from '../auth/auth-user';
import type { SubscriptionPostActivationService } from './subscription-post-activation.service';
import { SubscriptionActivationOrchestratorService } from './subscription-activation-orchestrator.service';
import type { SubscriptionsService } from './subscriptions.service';

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

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const SUBSCRIPTION_ID = '33333333-3333-4333-8333-333333333333';

describe('SubscriptionActivationOrchestratorService', () => {
  const subscriptionsService = {
    reconcileActivation: jest.fn(),
  };
  const postActivationService = {
    process: jest.fn(),
  };

  let service: SubscriptionActivationOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    subscriptionsService.reconcileActivation.mockResolvedValue({
      activationMode: 'MANUAL',
      activationApplied: true,
      activationRequired: false,
      subscription: { id: SUBSCRIPTION_ID, status: 'ACTIVE' },
    });
    postActivationService.process.mockResolvedValue({
      referralCommission: { processingStatus: 'PROCESSED' },
      referralCommissionPendingReason: null,
      rewardLifecycle: {
        initialized: true,
        noEffectivePolicy: false,
        state: { subscriptionId: SUBSCRIPTION_ID, status: 'ACTIVE' },
      },
      rewardLifecyclePendingReason: null,
      downstreamPending: false,
    });

    service = new SubscriptionActivationOrchestratorService(
      subscriptionsService as unknown as SubscriptionsService,
      postActivationService as unknown as SubscriptionPostActivationService,
    );
  });

  it('keeps the controller path thin and runs the shared downstream stages', async () => {
    const result = await service.reconcileActivation(DEPOSIT_ID, actor);

    expect(subscriptionsService.reconcileActivation).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(postActivationService.process).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      actor,
      {},
    );
    expect(result).toMatchObject({
      activationApplied: true,
      downstreamPending: false,
      message:
        'Package activation, commission processing, and reward lifecycle initialization completed.',
    });
  });

  it('does not misreport an already active subscription when downstream recovery is pending', async () => {
    postActivationService.process.mockResolvedValue({
      referralCommission: null,
      referralCommissionPendingReason: 'Commission temporarily unavailable',
      rewardLifecycle: null,
      rewardLifecyclePendingReason: 'Reward state temporarily unavailable',
      downstreamPending: true,
    });

    const result = await service.reconcileActivation(DEPOSIT_ID, actor);

    expect(result).toMatchObject({
      activationApplied: true,
      subscription: { id: SUBSCRIPTION_ID, status: 'ACTIVE' },
      downstreamPending: true,
      message:
        'Package activation completed. One or more downstream earnings stages remain safely recoverable.',
    });
  });
});
