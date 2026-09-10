import type { AuthenticatedUser } from '../auth/auth-user';
import type { DepositApprovalModeService } from './deposit-approval-mode.service';
import type { DepositApprovalOrchestratorService } from './deposit-approval-orchestrator.service';
import { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import type { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'founder@example.com',
  username: 'founder',
  phone: null,
  firstName: 'Founder',
  lastName: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

describe('DepositBlockchainProcessingService', () => {
  const verification = {
    verifyDeposit: jest.fn(),
  };
  const approvalMode = {
    getDepositApprovalPolicy: jest.fn(),
    resolveAutomaticApprovalActor: jest.fn(),
  };
  const approvalOrchestrator = {
    approveDeposit: jest.fn(),
  };

  let service: DepositBlockchainProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    verification.verifyDeposit.mockResolvedValue({
      message: 'Blockchain transaction verified.',
      alreadyVerified: false,
      verification: { status: 'VERIFIED' },
    });
    approvalMode.getDepositApprovalPolicy.mockResolvedValue({
      depositId: DEPOSIT_ID,
      approvalMode: 'MANUAL',
      verificationMode: 'VERIFY_ONLY',
      verificationStatus: 'VERIFIED',
    });
    approvalMode.resolveAutomaticApprovalActor.mockResolvedValue(actor);
    approvalOrchestrator.approveDeposit.mockResolvedValue({
      message: 'Deposit approved.',
      deposit: { id: DEPOSIT_ID, status: 'APPROVED' },
    });

    service = new DepositBlockchainProcessingService(
      verification as unknown as DepositBlockchainVerificationService,
      approvalMode as unknown as DepositApprovalModeService,
      approvalOrchestrator as unknown as DepositApprovalOrchestratorService,
    );
  });

  it('records verification but does not auto approve in MANUAL mode', async () => {
    const result = (await service.verifyAndApplyPolicy(DEPOSIT_ID, actor)) as {
      approvalPolicy: { approvalMode: string };
      autoApproval: { attempted: boolean; approved: boolean };
    };

    expect(approvalOrchestrator.approveDeposit).not.toHaveBeenCalled();
    expect(result.approvalPolicy.approvalMode).toBe('MANUAL');
    expect(result.autoApproval).toMatchObject({
      attempted: false,
      approved: false,
    });
  });

  it('waits without approval while AUTO mode verification is not VERIFIED', async () => {
    approvalMode.getDepositApprovalPolicy.mockResolvedValue({
      depositId: DEPOSIT_ID,
      approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
      verificationMode: 'VERIFY_ONLY',
      verificationStatus: 'PENDING',
    });
    verification.verifyDeposit.mockResolvedValue({
      message: 'Blockchain transaction is pending.',
      alreadyVerified: false,
      verification: { status: 'PENDING' },
    });

    const result = (await service.verifyAndApplyPolicy(DEPOSIT_ID, actor)) as {
      autoApproval: { attempted: boolean; approved: boolean };
    };

    expect(approvalOrchestrator.approveDeposit).not.toHaveBeenCalled();
    expect(result.autoApproval).toMatchObject({
      attempted: false,
      approved: false,
    });
  });

  it('auto approves through the existing financial lifecycle only after VERIFIED', async () => {
    approvalMode.getDepositApprovalPolicy.mockResolvedValue({
      depositId: DEPOSIT_ID,
      approvalMode: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED',
      verificationMode: 'VERIFY_ONLY',
      verificationStatus: 'VERIFIED',
    });

    const result = (await service.verifyAndApplyPolicy(DEPOSIT_ID, actor)) as {
      autoApproval: { attempted: boolean; approved: boolean };
    };

    expect(approvalMode.resolveAutomaticApprovalActor).toHaveBeenCalledWith(
      DEPOSIT_ID,
    );
    expect(approvalOrchestrator.approveDeposit).toHaveBeenCalledWith(
      DEPOSIT_ID,
      {
        note: 'AUTO_AFTER_BLOCKCHAIN_VERIFIED — on-chain payment verification passed.',
      },
      actor,
      {},
      'AUTO_BLOCKCHAIN',
    );
    expect(result.autoApproval).toMatchObject({
      attempted: true,
      approved: true,
    });
  });
});
