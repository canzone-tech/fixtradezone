import type { AuthenticatedUser } from '../auth/auth-user';
import type { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { DepositAccountingRecoveryService } from './deposit-accounting-recovery.service';
import type { WalletLedgerService } from './wallet-ledger.service';

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

describe('DepositAccountingRecoveryService', () => {
  const walletLedgerService = {
    reconcileApprovedDeposit: jest.fn(),
  };
  const subscriptionsService = {
    activateAutomaticallyAfterAccounting: jest.fn(),
  };
  const postActivationService = {
    process: jest.fn(),
  };

  let service: DepositAccountingRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    walletLedgerService.reconcileApprovedDeposit.mockResolvedValue({
      transaction: { id: 'deposit-ledger-id' },
    });
    subscriptionsService.activateAutomaticallyAfterAccounting.mockResolvedValue(
      {
        activationMode: 'AUTO',
        activationTrigger: 'PAYMENT_APPROVED',
        activationRequired: false,
        subscription: { id: SUBSCRIPTION_ID, status: 'ACTIVE' },
      },
    );
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

    service = new DepositAccountingRecoveryService(
      walletLedgerService as unknown as WalletLedgerService,
      subscriptionsService as unknown as SubscriptionsService,
      postActivationService as unknown as SubscriptionPostActivationService,
    );
  });

  it('continues an approved-deposit recovery through activation, commission, and reward initialization', async () => {
    const result = await service.reconcileApprovedDeposit(DEPOSIT_ID, actor);

    expect(walletLedgerService.reconcileApprovedDeposit).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(
      subscriptionsService.activateAutomaticallyAfterAccounting,
    ).toHaveBeenCalledWith(DEPOSIT_ID, actor, {});
    expect(postActivationService.process).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      actor,
      {},
    );
    expect(result).toMatchObject({
      transaction: { id: 'deposit-ledger-id' },
      packageActivation: {
        activationMode: 'AUTO',
        subscription: { id: SUBSCRIPTION_ID, status: 'ACTIVE' },
      },
      packageActivationPendingReason: null,
      referralCommission: { processingStatus: 'PROCESSED' },
      rewardLifecycle: {
        initialized: true,
        state: { subscriptionId: SUBSCRIPTION_ID, status: 'ACTIVE' },
      },
      downstreamPending: false,
    });
  });

  it('preserves successful accounting when package activation still needs recovery', async () => {
    subscriptionsService.activateAutomaticallyAfterAccounting.mockRejectedValue(
      new Error('This plan allows only one active package for the USER.'),
    );

    const result = await service.reconcileApprovedDeposit(DEPOSIT_ID, actor);

    expect(postActivationService.process).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transaction: { id: 'deposit-ledger-id' },
      packageActivation: null,
      packageActivationPendingReason:
        'This plan allows only one active package for the USER.',
      referralCommission: null,
      rewardLifecycle: null,
      downstreamPending: true,
    });
  });

  it('does not bypass a package configured for manual activation', async () => {
    subscriptionsService.activateAutomaticallyAfterAccounting.mockResolvedValue(
      {
        activationMode: 'MANUAL',
        activationTrigger: 'MANUAL_ACTIVATION',
        activationRequired: true,
        subscription: null,
      },
    );

    const result = await service.reconcileApprovedDeposit(DEPOSIT_ID, actor);

    expect(postActivationService.process).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      packageActivation: {
        activationMode: 'MANUAL',
        activationRequired: true,
      },
      packageActivationPendingReason: null,
      referralCommission: null,
      rewardLifecycle: null,
      downstreamPending: false,
    });
  });
});
