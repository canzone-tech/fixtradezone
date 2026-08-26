import type { AuthenticatedUser } from '../auth/auth-user';
import type { AccountingConfigService } from '../platform-config/accounting-config.service';
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

    service = new DepositApprovalOrchestratorService(
      depositsService as unknown as DepositsService,
      accountingConfigService as unknown as AccountingConfigService,
      walletLedgerService as unknown as WalletLedgerService,
    );
  });

  it('automatically posts accounting after approval when policy is AUTO_ON_APPROVAL', async () => {
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
    expect(result).toMatchObject({
      accountingPostingMode: 'AUTO_ON_APPROVAL',
      accountingPosted: true,
    });
  });

  it('keeps approved deposits pending accounting when policy is MANUAL_RECONCILIATION', async () => {
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
    expect(result).toMatchObject({
      accountingPostingMode: 'MANUAL_RECONCILIATION',
      accountingPosted: false,
    });
  });

  it('surfaces an automatic-posting failure after approval so reconciliation can recover it', async () => {
    accountingConfigService.getDepositPostingMode.mockResolvedValue(
      'AUTO_ON_APPROVAL',
    );
    walletLedgerService.reconcileApprovedDeposit.mockRejectedValue(
      new Error('ledger unavailable'),
    );

    await expect(
      service.approveDeposit(DEPOSIT_ID, { note: 'verified' }, actor),
    ).rejects.toThrow('ledger unavailable');

    expect(depositsService.approveDeposit).toHaveBeenCalledTimes(1);
    expect(walletLedgerService.reconcileApprovedDeposit).toHaveBeenCalledTimes(
      1,
    );
  });
});
