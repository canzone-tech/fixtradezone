import type { AuthenticatedUser } from '../auth/auth-user';
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
    verifyDeposit: jest.fn(),
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
    blockchainVerification.verifyDeposit.mockResolvedValue({
      message: 'Blockchain transaction is not ready for verification yet.',
      alreadyVerified: false,
      verification: { status: 'PENDING' },
    });

    service = new DepositSubmissionOrchestratorService(
      packageDepositFlowService as unknown as PackageDepositFlowService,
      blockchainVerification as unknown as DepositBlockchainVerificationService,
    );
  });

  it('attempts blockchain verification after the deposit transaction commits', async () => {
    const result = await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        amount: '20',
        txid: 'a'.repeat(64),
      },
      actor,
    );

    expect(packageDepositFlowService.submitDeposit).toHaveBeenCalledTimes(1);
    expect(blockchainVerification.verifyDeposit).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
    );
    expect(result.blockchainVerification).toMatchObject({
      required: true,
      attempted: true,
      verification: { status: 'PENDING' },
    });
  });

  it('does not call the verifier when the payment rail has verification off', async () => {
    blockchainVerification.getDepositVerification.mockResolvedValue({
      depositId: DEPOSIT_ID,
      required: false,
      verification: null,
    });

    const result = await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        amount: '20',
        txid: 'a'.repeat(64),
      },
      actor,
    );

    expect(blockchainVerification.verifyDeposit).not.toHaveBeenCalled();
    expect(result.blockchainVerification).toMatchObject({
      required: false,
      attempted: false,
    });
  });

  it('keeps a submitted deposit pending review when automatic verification cannot complete', async () => {
    blockchainVerification.verifyDeposit.mockRejectedValue(
      new Error('RPC configuration incomplete'),
    );

    const result = await service.submitPackageDeposit(
      {
        packagePlanItemId: '33333333-3333-4333-8333-333333333333',
        amount: '20',
        txid: 'a'.repeat(64),
      },
      actor,
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
