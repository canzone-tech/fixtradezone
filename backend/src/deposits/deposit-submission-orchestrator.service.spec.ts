import type { AuthenticatedUser } from '../auth/auth-user';
import type { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import type { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import { DepositSubmissionOrchestratorService } from './deposit-submission-orchestrator.service';
import type { PackageDepositFlowService } from './package-deposit-flow.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const actor = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'user@example.com',
  username: 'user',
  phone: null,
  firstName: 'User',
  lastName: 'One',
  status: 'ACTIVE',
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['USER'],
  permissions: [],
} satisfies AuthenticatedUser;

describe('DepositSubmissionOrchestratorService', () => {
  const packageDepositFlowService = {
    submitDeposit: jest.fn(),
  };
  const blockchainVerification = {
    getDepositVerification: jest.fn(),
  };
  const blockchainProcessing = {
    verifyAndApplyPolicy: jest.fn(),
  };

  let service: DepositSubmissionOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    packageDepositFlowService.submitDeposit.mockResolvedValue({
      message: 'Deposit submitted for manual review.',
      deposit: { id: DEPOSIT_ID, status: 'PENDING_REVIEW' },
    });
    blockchainVerification.getDepositVerification.mockResolvedValue({
      depositId: DEPOSIT_ID,
      required: true,
      verification: null,
    });
    blockchainProcessing.verifyAndApplyPolicy.mockResolvedValue({
      message: 'Blockchain transaction is not ready for verification yet.',
      alreadyVerified: false,
      verification: { status: 'PENDING' },
      approvalPolicy: { approvalMode: 'MANUAL' },
    });

    service = new DepositSubmissionOrchestratorService(
      packageDepositFlowService as unknown as PackageDepositFlowService,
      blockchainVerification as unknown as DepositBlockchainVerificationService,
      blockchainProcessing as unknown as DepositBlockchainProcessingService,
    );
  });

  it('attempts blockchain verification and applies approval policy after the deposit commits', async () => {
    const result = (await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        amount: '20',
        txid: 'a'.repeat(64),
      },
      actor,
    )) as Record<string, any>;

    expect(packageDepositFlowService.submitDeposit).toHaveBeenCalledTimes(1);
    expect(blockchainProcessing.verifyAndApplyPolicy).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(result.blockchainVerification).toMatchObject({
      required: true,
      attempted: true,
      verification: { status: 'PENDING' },
      approvalPolicy: { approvalMode: 'MANUAL' },
    });
  });

  it('does not call the processor when the payment rail has blockchain verification off', async () => {
    blockchainVerification.getDepositVerification.mockResolvedValue({
      depositId: DEPOSIT_ID,
      required: false,
      verification: null,
    });

    const result = (await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        amount: '20',
        txid: 'a'.repeat(64),
      },
      actor,
    )) as Record<string, any>;

    expect(blockchainProcessing.verifyAndApplyPolicy).not.toHaveBeenCalled();
    expect(result.blockchainVerification).toMatchObject({
      required: false,
      attempted: false,
    });
  });

  it('keeps a submitted deposit pending review when automatic verification cannot complete', async () => {
    blockchainProcessing.verifyAndApplyPolicy.mockRejectedValue(
      new Error('RPC configuration incomplete'),
    );

    const result = (await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        amount: '20',
        txid: 'a'.repeat(64),
      },
      actor,
    )) as Record<string, any>;

    expect(result.deposit).toMatchObject({
      id: DEPOSIT_ID,
      status: 'PENDING_REVIEW',
    });
    expect(result.blockchainVerification).toMatchObject({
      required: true,
      attempted: true,
      verification: null,
    });
  });
});
