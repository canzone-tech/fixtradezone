import type { AuthenticatedUser } from '../auth/auth-user';
import type { AccountingConfigService } from '../platform-config/accounting-config.service';
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
  const accountingConfigService = {
    getDepositPostingMode: jest.fn(),
  };
  const walletLedgerService = {
    reconcileApprovedDeposit: jest.fn(),
  };
  const subscriptionsService = {
    activateAutomaticallyAfterAccounting: jest.fn(),
  };

  let service: DepositApprovalOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
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

    service = new DepositApprovalOrchestratorService(
      depositsService as unknown as DepositsService,
      accountingConfigService as unknown as AccountingConfigService,
      walletLedgerService as unknown as WalletLedgerService,
      subscriptionsService as unknown as SubscriptionsService,
    );
  });

  it('automatically posts accounting and activates the package in AUTO mode', async () => {
    accountingConfigService.getDepositPostingMode.mockResolvedValue(
      'AUTO_ON_APPROVAL',
    );

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
    expect(result).toMatchObject({
      accountingPostingMode: 'AUTO_ON_APPROVAL',
      accountingPosted: true,
      packageActivated: true,
      packageActivationMode: 'AUTO',
      packageActivationTrigger: 'PAYMENT_APPROVED',
      packageActivationRequired: false,
      subscription: { id: 'subscription-id', status: 'ACTIVE' },
    });
  });

  it('keeps approved deposits pending accounting and activation in MANUAL mode', async () => {
    accountingConfigService.getDepositPostingMode.mockResolvedValue(
      'MANUAL_RECONCILIATION',
    );

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
    expect(result).toMatchObject({
      accountingPostingMode: 'MANUAL_RECONCILIATION',
      accountingPosted: false,
      packageActivated: false,
    });
  });

  it('keeps approval successful when accounting needs reconciliation', async () => {
    accountingConfigService.getDepositPostingMode.mockResolvedValue(
      'AUTO_ON_APPROVAL',
    );
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
    expect(result).toMatchObject({
      accountingPostingMode: 'AUTO_ON_APPROVAL',
      accountingPosted: false,
      accountingPendingReason: 'ledger unavailable',
      packageActivated: false,
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });
  });

  it('keeps approval/accounting successful when package activation needs reconciliation', async () => {
    accountingConfigService.getDepositPostingMode.mockResolvedValue(
      'AUTO_ON_APPROVAL',
    );
    subscriptionsService.activateAutomaticallyAfterAccounting.mockRejectedValue(
      new Error('This plan allows only one active package for the USER.'),
    );

    const result = await service.approveDeposit(
      DEPOSIT_ID,
      { note: 'verified' },
      actor,
    );

    expect(result).toMatchObject({
      accountingPosted: true,
      packageActivated: false,
      packageActivationPendingReason:
        'This plan allows only one active package for the USER.',
    });
  });
});
