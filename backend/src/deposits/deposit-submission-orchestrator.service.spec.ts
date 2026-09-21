import type { AuthenticatedUser } from '../auth/auth-user';
import type { DepositBlockchainProcessingService } from './deposit-blockchain-processing.service';
import type { DepositBlockchainVerificationService } from './deposit-blockchain-verification.service';
import { DepositSubmissionOrchestratorService } from './deposit-submission-orchestrator.service';
import type { DepositsService } from './deposits.service';
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
  const depositsService = {
    submitTxid: jest.fn(),
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
      message: 'Deposit request created.',
      deposit: { id: DEPOSIT_ID, status: 'AWAITING_TXID' },
    });
    depositsService.submitTxid.mockResolvedValue({
      message: 'TXID submitted for manual review.',
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
      depositsService as unknown as DepositsService,
      blockchainVerification as unknown as DepositBlockchainVerificationService,
      blockchainProcessing as unknown as DepositBlockchainProcessingService,
    );
  });

  it('reserves a package deposit without attempting blockchain verification before payment', async () => {
    const result = (await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        investmentAmount: '20',
      },
      actor,
    )) as Record<string, any>;

    expect(packageDepositFlowService.submitDeposit).toHaveBeenCalledTimes(1);
    expect(blockchainVerification.getDepositVerification).not.toHaveBeenCalled();
    expect(blockchainProcessing.verifyAndApplyPolicy).not.toHaveBeenCalled();
    expect(result.deposit).toMatchObject({
      id: DEPOSIT_ID,
      status: 'AWAITING_TXID',
    });
  });

  it('attempts blockchain verification only after the reserved deposit receives a txid', async () => {
    const result = (await service.submitDepositTxid(
      DEPOSIT_ID,
      { txid: 'a'.repeat(64) },
      actor,
    )) as Record<string, any>;

    expect(depositsService.submitTxid).toHaveBeenCalledWith(
      DEPOSIT_ID,
      { txid: 'a'.repeat(64) },
      actor,
      {},
    );
    expect(blockchainProcessing.verifyAndApplyPolicy).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(result.message).toBe(
      'TXID submitted successfully. Payment verification is being processed.',
    );
    expect(result.blockchainVerification).toMatchObject({
      required: true,
      attempted: true,
      verification: { status: 'PENDING' },
      approvalPolicy: { approvalMode: 'MANUAL' },
    });
  });

  it('does not call the processor after txid submission when blockchain verification is off', async () => {
    blockchainVerification.getDepositVerification.mockResolvedValue({
      depositId: DEPOSIT_ID,
      required: false,
      verification: null,
    });

    const result = (await service.submitDepositTxid(
      DEPOSIT_ID,
      { txid: 'a'.repeat(64) },
      actor,
    )) as Record<string, any>;

    expect(blockchainProcessing.verifyAndApplyPolicy).not.toHaveBeenCalled();
    expect(result.message).toBe('TXID submitted successfully.');
    expect(result.blockchainVerification).toMatchObject({
      required: false,
      attempted: false,
    });
  });

  it('keeps the submitted txid pending review when automatic verification cannot complete', async () => {
    blockchainProcessing.verifyAndApplyPolicy.mockRejectedValue(
      new Error('RPC configuration incomplete'),
    );

    const result = (await service.submitDepositTxid(
      DEPOSIT_ID,
      { txid: 'a'.repeat(64) },
      actor,
    )) as Record<string, any>;

    expect(result.message).toBe(
      'TXID submitted successfully. Payment verification could not complete yet.',
    );
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
