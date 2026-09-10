import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { OperationsConfigService } from '../platform-config/operations-config.service';
import type { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import type { DepositBlockchainApprovalGuardService } from './deposit-blockchain-approval-guard.service';
import type { DepositsService } from './deposits.service';
import type { DirectDepositApprovalService } from './direct-deposit-approval.service';

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

const adminActor: AuthenticatedUser = {
  ...actor,
  id: '33333333-3333-4333-8333-333333333333',
  email: 'reviewer@example.com',
  username: 'reviewer',
  roles: ['ADMIN'],
  permissions: ['deposits.review'],
};

describe('DepositApprovalOrchestratorService', () => {
  const depositsService = {
    getDeposit: jest.fn(),
    approveDeposit: jest.fn(),
  };
  const directDepositApprovalService = {
    approvePendingDeposit: jest.fn(),
  };
  const blockchainApprovalGuard = {
    assertApprovalAllowed: jest.fn(),
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
  const postActivationService = {
    process: jest.fn(),
  };

  let service: DepositApprovalOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    depositsService.getDeposit.mockResolvedValue({
      deposit: { id: DEPOSIT_ID, status: 'READY_FOR_APPROVAL' },
    });
    blockchainApprovalGuard.assertApprovalAllowed.mockResolvedValue({
      required: true,
      allowed: true,
      verificationStatus: 'VERIFIED',
    });
    operationsConfigService.getOperations.mockResolvedValue({
      platformTimezone: 'Asia/Kolkata',
      operationsMode: 'AUTOMATIC',
      updatedAt: null,
    });
    depositsService.approveDeposit.mockResolvedValue({
      message: 'Deposit approved.',
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });
    directDepositApprovalService.approvePendingDeposit.mockResolvedValue({
      message: 'Deposit directly approved by SUPER_ADMIN.',
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
      approvalPath: 'SUPER_ADMIN_DIRECT',
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
    postActivationService.process.mockResolvedValue({
      referralCommission: {
        processingStatus: 'PROCESSED',
        created: true,
        run: { id: 'commission-run-id', outcome: 'PROCESSED' },
        events: [],
      },
      referralCommissionPendingReason: null,
      rewardLifecycle: {
        initialized: true,
        noEffectivePolicy: false,
        events: [],
        state: { subscriptionId: 'subscription-id', status: 'ACTIVE' },
        catchupLimitReached: false,
        message: 'No package reward is due yet.',
      },
      rewardLifecyclePendingReason: null,
      downstreamPending: false,
    });

    service = new DepositApprovalOrchestratorService(
      depositsService as unknown as DepositsService,
      directDepositApprovalService as unknown as DirectDepositApprovalService,
      blockchainApprovalGuard as unknown as DepositBlockchainApprovalGuardService,
      operationsConfigService as unknown as OperationsConfigService,
      walletLedgerService as unknown as WalletLedgerService,
      subscriptionsService as unknown as SubscriptionsService,
      postActivationService as unknown as SubscriptionPostActivationService,
    );
  });

  it('blocks ADMIN final approval before reading deposit or blockchain policy', async () => {
    await expect(
      service.approveDeposit(
        DEPOSIT_ID,
        { note: 'ADMIN must not approve' },
        adminActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(depositsService.getDeposit).not.toHaveBeenCalled();
    expect(blockchainApprovalGuard.assertApprovalAllowed).not.toHaveBeenCalled();
    expect(operationsConfigService.getOperations).not.toHaveBeenCalled();
    expect(depositsService.approveDeposit).not.toHaveBeenCalled();
    expect(
      directDepositApprovalService.approvePendingDeposit,
    ).not.toHaveBeenCalled();
  });

  it('blocks SUPER_ADMIN approval before any financial action when blockchain verification is not VERIFIED', async () => {
    blockchainApprovalGuard.assertApprovalAllowed.mockRejectedValue(
      new ConflictException('Blockchain verification is pending.'),
    );

    await expect(
      service.approveDeposit(
        DEPOSIT_ID,
        { note: 'Do not bypass blockchain gate' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(blockchainApprovalGuard.assertApprovalAllowed).toHaveBeenCalledWith(
      DEPOSIT_ID,
    );
    expect(operationsConfigService.getOperations).not.toHaveBeenCalled();
    expect(depositsService.approveDeposit).not.toHaveBeenCalled();
    expect(
      directDepositApprovalService.approvePendingDeposit,
    ).not.toHaveBeenCalled();
    expect(walletLedgerService.reconcileApprovedDeposit).not.toHaveBeenCalled();
    expect(
      subscriptionsService.activateAutomaticallyAfterAccounting,
    ).not.toHaveBeenCalled();
    expect(postActivationService.process).not.toHaveBeenCalled();
  });

  it('lets SUPER_ADMIN directly approve a pending deposit after blockchain verification passes', async () => {
    depositsService.getDeposit.mockResolvedValue({
      deposit: { id: DEPOSIT_ID, status: 'PENDING_REVIEW' },
    });

    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'Founder direct approval' },
      actor,
    );

    expect(blockchainApprovalGuard.assertApprovalAllowed).toHaveBeenCalledWith(
      DEPOSIT_ID,
    );
    expect(
      directDepositApprovalService.approvePendingDeposit,
    ).toHaveBeenCalledWith(
      DEPOSIT_ID,
      { note: 'Founder direct approval' },
      actor,
      {},
    );
    expect(depositsService.approveDeposit).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      approvalPath: 'SUPER_ADMIN_DIRECT',
      accountingPosted: true,
      packageActivated: true,
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });
  });

  it('does not retroactively apply the blockchain guard to an already approved deposit', async () => {
    depositsService.getDeposit.mockResolvedValue({
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });

    await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'Recovery call' },
      actor,
    );

    expect(blockchainApprovalGuard.assertApprovalAllowed).not.toHaveBeenCalled();
  });

  it('runs the complete safe downstream chain from one approval in AUTOMATIC mode', async () => {
    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(depositsService.approveDeposit).toHaveBeenCalledTimes(1);
    expect(
      directDepositApprovalService.approvePendingDeposit,
    ).not.toHaveBeenCalled();
    expect(walletLedgerService.reconcileApprovedDeposit).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(
      subscriptionsService.activateAutomaticallyAfterAccounting,
    ).toHaveBeenCalledWith(DEPOSIT_ID, actor, {});
    expect(postActivationService.process).toHaveBeenCalledWith(
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
    expect(postActivationService.process).not.toHaveBeenCalled();
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
    expect(postActivationService.process).not.toHaveBeenCalled();
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

    expect(postActivationService.process).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      accountingPosted: true,
      packageActivated: false,
      packageActivationPendingReason:
        'This plan allows only one active package for the USER.',
    });
  });

  it('bulk approval isolates one failed deposit instead of rolling back successful items', async () => {
    const secondDepositId = '44444444-4444-4444-8444-444444444444';
    depositsService.getDeposit.mockImplementation((depositId: string) =>
      Promise.resolve({
        deposit: { id: depositId, status: 'READY_FOR_APPROVAL' },
      }),
    );
    depositsService.approveDeposit
      .mockResolvedValueOnce({
        message: 'Deposit approved.',
        deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
      })
      .mockRejectedValueOnce(new Error('Deposit is not ready for approval.'));

    const result = await service.approveDepositsBulk(
      {
        depositIds: [DEPOSIT_ID, secondDepositId],
        note: 'Founder bulk final approval',
      },
      actor,
    );

    expect(result).toMatchObject({
      approved: 1,
      failed: 1,
      results: [
        { depositId: DEPOSIT_ID, ok: true },
        {
          depositId: secondDepositId,
          ok: false,
          message: 'Deposit is not ready for approval.',
        },
      ],
    });
  });

  it('never misreports a successful activation when a downstream stage needs reconciliation', async () => {
    postActivationService.process.mockResolvedValue({
      referralCommission: {
        processingStatus: 'PENDING_RECONCILIATION',
        message: 'Commission plan requires reconciliation.',
      },
      referralCommissionPendingReason:
        'Commission plan requires reconciliation.',
      rewardLifecycle: null,
      rewardLifecyclePendingReason: 'Reward state temporarily unavailable',
      downstreamPending: true,
    });

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
