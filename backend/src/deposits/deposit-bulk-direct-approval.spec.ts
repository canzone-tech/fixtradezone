import type { AuthenticatedUser } from '../auth/auth-user';
import type { OperationsConfigService } from '../platform-config/operations-config.service';
import type { SubscriptionPostActivationService } from '../subscriptions/subscription-post-activation.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { WalletLedgerService } from '../wallet/wallet-ledger.service';
import { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import type { DepositsService } from './deposits.service';
import type { DirectDepositApprovalService } from './direct-deposit-approval.service';

const PENDING_ID = '11111111-1111-4111-8111-111111111111';
const READY_ID = '22222222-2222-4222-8222-222222222222';

const actor: AuthenticatedUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'founder@example.com',
  username: 'founder',
  phone: null,
  firstName: 'Founder',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

describe('DepositApprovalOrchestratorService mixed bulk approval', () => {
  const depositsService = {
    getDeposit: jest.fn(),
    approveDeposit: jest.fn(),
  };
  const directDepositApprovalService = {
    approvePendingDeposit: jest.fn(),
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

    depositsService.getDeposit.mockImplementation((depositId: string) =>
      Promise.resolve({
        deposit: {
          id: depositId,
          status:
            depositId === PENDING_ID
              ? 'PENDING_REVIEW'
              : 'READY_FOR_APPROVAL',
        },
      }),
    );
    depositsService.approveDeposit.mockImplementation((depositId: string) =>
      Promise.resolve({
        message: 'Deposit approved.',
        deposit: { id: depositId, status: 'APPROVED' },
      }),
    );
    directDepositApprovalService.approvePendingDeposit.mockImplementation(
      (depositId: string) =>
        Promise.resolve({
          message: 'Deposit directly approved by SUPER_ADMIN.',
          deposit: { id: depositId, status: 'APPROVED' },
          approvalPath: 'SUPER_ADMIN_DIRECT',
        }),
    );
    operationsConfigService.getOperations.mockResolvedValue({
      platformTimezone: 'Asia/Kolkata',
      operationsMode: 'CONTROLLED_MANUAL',
      updatedAt: null,
    });

    service = new DepositApprovalOrchestratorService(
      depositsService as unknown as DepositsService,
      directDepositApprovalService as unknown as DirectDepositApprovalService,
      operationsConfigService as unknown as OperationsConfigService,
      walletLedgerService as unknown as WalletLedgerService,
      subscriptionsService as unknown as SubscriptionsService,
      postActivationService as unknown as SubscriptionPostActivationService,
    );
  });

  it('routes pending and ADMIN-reviewed deposits independently in one SUPER_ADMIN bulk request', async () => {
    const note = 'Founder mixed bulk approval';
    const result = await service.approveDepositsBulk(
      { depositIds: [PENDING_ID, READY_ID], note },
      actor,
    );

    expect(
      directDepositApprovalService.approvePendingDeposit,
    ).toHaveBeenCalledWith(PENDING_ID, { note }, actor, {});
    expect(depositsService.approveDeposit).toHaveBeenCalledWith(
      READY_ID,
      { note },
      actor,
      {},
    );
    expect(depositsService.approveDeposit).not.toHaveBeenCalledWith(
      PENDING_ID,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(result).toMatchObject({
      approved: 2,
      failed: 0,
      results: [
        { depositId: PENDING_ID, ok: true, status: 'APPROVED' },
        { depositId: READY_ID, ok: true, status: 'APPROVED' },
      ],
    });
    expect(walletLedgerService.reconcileApprovedDeposit).not.toHaveBeenCalled();
  });
});
