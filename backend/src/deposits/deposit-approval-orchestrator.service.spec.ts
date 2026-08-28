import type { AuthenticatedUser } from '../auth/auth-user';
import type { CommissionsService } from '../commissions/commissions.service';
import type { OperationsConfigService } from '../platform-config/operations-config.service';
import type { RewardsService } from '../rewards/rewards.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import type { DepositsService } from './deposits.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';

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

describe('DepositApprovalOrchestratorService', () => {
  const depositsService = {
    approveDeposit: jest.fn(),
  };
  const operationsConfigService = {
    getOperations: jest.fn(),
  };
  const walletLedgerService = {
    reconcileApprovedDeposit: jest.fn(),
  };
  const subscriptionsService = {
    activateAutomaticallyAfterAccounting: jest.fn(),
  };
  const commissionsService = {
    processSubscriptionSafely: jest.fn(),
  };
  const rewardsService = {
    reconcileSubscription: jest.fn(),
  };

  let service: DepositApprovalOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    operationsConfigService.getOperations.mockResolvedValue({
      platformTimezone: 'Asia/Kolkata',
      operationsMode: 'AUTOMATIC',
      updatedAt: null,
    });
    depositsService.approveDeposit.mockResolvedValue({
      message: 'Deposit approved.',
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });
    walletLedgerService.reconcileApprovedDeposit.mockResolvedValue({
      message: 'Approved deposit posted to Main / Deposit Balance.',
      transaction: { id: 'ledger-transaction-id' },
    });
    subscriptionsService.activateAutomaticallyAfterAccounting.mockResolvedValue(
      {
        activationMode: 'AUTO',
        activationTrigger: 'PAYMENT_APPROVED',
        activePackageMode: 'MULTIPLE_ACTIVE',
        activationApplied: true,
        activationRequired: false,
        created: true,
        message: 'Package activated.',
        subscription: { id: 'subscription-id', status: 'ACTIVE' },
      },
    );
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
      state: { subscriptionId: 'subscription-id', status: 'ACTIVE' },
      catchupLimitReached: false,
      message: 'No package reward is due yet.',
    });

    service = new DepositApprovalOrchestratorService(
      depositsService as unknown as DepositsService,
      operationsConfigService as unknown as OperationsConfigService,
      walletLedgerService as unknown as WalletLedgerService,
      subscriptionsService as unknown as SubscriptionsService,
      commissionsService as unknown as CommissionsService,
      rewardsService as unknown as RewardsService,
    );
  });

  it('runs the complete safe downstream chain from one approval in AUTOMATIC mode', async () => {
    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(depositsService.approveDeposit).toHaveBeenCalledTimes(1);
    expect(walletLedgerService.reconcileApprovedDeposit).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(
      subscriptionsService.activateAutomaticallyAfterAccounting,
    ).toHaveBeenCalledWith(DEPOSIT_ID, actor, {});
    expect(commissionsService.processSubscriptionSafely).toHaveBeenCalledWith(
      'subscription-id',
      actor,
      {},
    );
    expect(rewardsService.reconcileSubscription).toHaveBeenCalledWith(
      'subscription-id',
      actor,
      {},
    );
    expect(result).toMatchObject({
      operationsMode: 'AUTOMATIC',
      platformTimezone: 'Asia/Kolkata',
      accountingPostingMode: 'AUTO_ON_APPROVAL',
      accountingPosted: true,
      packageActivated: true,
      packageActivationMode: 'AUTO',
      packageActivationTrigger: 'PAYMENT_APPROVED',
      packageActivationRequired: false,
      subscription: { id: 'subscription-id', status: 'ACTIVE' },
      referralCommission: {
        processingStatus: 'PROCESSED',
        run: { id: 'commission-run-id', outcome: 'PROCESSED' },
      },
      rewardLifecycle: {
        initialized: true,
        noEffectivePolicy: false,
        state: { subscriptionId: 'subscription-id', status: 'ACTIVE' },
      },
      automaticDownstreamProcessing: true,
    });
  });

  it('keeps approved deposits waiting for recovery actions in CONTROLLED_MANUAL mode', async () => {
    operationsConfigService.getOperations.mockResolvedValue({
      platformTimezone: 'Asia/Kolkata',
      operationsMode: 'CONTROLLED_MANUAL',
      updatedAt: null,
    });

    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(depositsService.approveDeposit).toHaveBeenCalledTimes(1);
    expect(walletLedgerService.reconcileApprovedDeposit).not.toHaveBeenCalled();
    expect(
      subscriptionsService.activateAutomaticallyAfterAccounting,
    ).not.toHaveBeenCalled();
    expect(commissionsService.processSubscriptionSafely).not.toHaveBeenCalled();
    expect(rewardsService.reconcileSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      operationsMode: 'CONTROLLED_MANUAL',
      accountingPostingMode: 'MANUAL_RECONCILIATION',
      accountingPosted: false,
      packageActivated: false,
      automaticDownstreamProcessing: false,
    });
  });

  it('keeps approval successful when accounting needs reconciliation', async () => {
    walletLedgerService.reconcileApprovedDeposit.mockRejectedValue(
      new Error('ledger unavailable'),
    );

    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(depositsService.approveDeposit).toHaveBeenCalledTimes(1);
    expect(walletLedgerService.reconcileApprovedDeposit).toHaveBeenCalledTimes(
      1,
    );
    expect(
      subscriptionsService.activateAutomaticallyAfterAccounting,
    ).not.toHaveBeenCalled();
    expect(commissionsService.processSubscriptionSafely).not.toHaveBeenCalled();
    expect(rewardsService.reconcileSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      accountingPostingMode: 'AUTO_ON_APPROVAL',
      accountingPosted: false,
      accountingPendingReason: 'ledger unavailable',
      packageActivated: false,
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });
  });

  it('keeps approval/accounting successful when package activation needs reconciliation', async () => {
    subscriptionsService.activateAutomaticallyAfterAccounting.mockRejectedValue(
      new Error('This plan allows only one active package for the USER.'),
    );

    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(commissionsService.processSubscriptionSafely).not.toHaveBeenCalled();
    expect(rewardsService.reconcileSubscription).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      accountingPosted: true,
      packageActivated: false,
      packageActivationPendingReason:
        'This plan allows only one active package for the USER.',
    });
  });

  it('never misreports a successful activation when a downstream stage needs reconciliation', async () => {
    commissionsService.processSubscriptionSafely.mockResolvedValue({
      processingStatus: 'PENDING_RECONCILIATION',
      message: 'Commission plan requires reconciliation.',
    });
    rewardsService.reconcileSubscription.mockRejectedValue(
      new Error('Reward state temporarily unavailable'),
    );

    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(result).toMatchObject({
      accountingPosted: true,
      packageActivated: true,
      subscription: { id: 'subscription-id', status: 'ACTIVE' },
      referralCommissionPendingReason:
        'Commission plan requires reconciliation.',
      rewardLifecyclePendingReason: 'Reward state temporarily unavailable',
    });
  });
});
