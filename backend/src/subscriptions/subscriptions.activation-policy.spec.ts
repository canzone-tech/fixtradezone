import type { AuthenticatedUser } from '../auth/auth-user';
import type { PrismaService } from '../database/prisma.service';
import { SUBSCRIPTION_AUDIT_OPERATIONS } from './subscriptions.constants';
import { SubscriptionsService } from './subscriptions.service';

const DEPOSIT_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_VERSION_ID = '77777777-7777-4777-8777-777777777777';

const actor: AuthenticatedUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: 'User',
  status: 'ACTIVE',
  createdAt: new Date('2026-08-27T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

describe('SubscriptionsService activation policy', () => {
  const prisma = {
    deposit: {
      findUnique: jest.fn(),
    },
    packagePlanVersion: {
      findUnique: jest.fn(),
    },
  };

  let service: SubscriptionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubscriptionsService(prisma as unknown as PrismaService);
  });

  it('defers activation when the source plan is configured for MANUAL_ACTIVATION', async () => {
    prisma.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      status: 'APPROVED',
      packagePlanVersionId: PLAN_VERSION_ID,
    });

    prisma.packagePlanVersion.findUnique.mockResolvedValue({
      id: PLAN_VERSION_ID,
      activePackageMode: 'MULTIPLE_ACTIVE',
      activationTrigger: 'MANUAL_ACTIVATION',
    });

    const activationSpy = jest.spyOn(service, 'activateFromApprovedDeposit');

    const result = await service.activateAutomaticallyAfterAccounting(
      DEPOSIT_ID,
      actor,
    );

    expect(result).toEqual({
      activationMode: 'MANUAL',
      activationTrigger: 'MANUAL_ACTIVATION',
      activePackageMode: 'MULTIPLE_ACTIVE',
      activationApplied: false,
      activationRequired: true,
      message:
        'Deposit accounting posted. Package is configured for authorized manual activation.',
    });

    expect(activationSpy).not.toHaveBeenCalled();
  });

  it('activates automatically when the source plan uses PAYMENT_APPROVED', async () => {
    prisma.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      status: 'APPROVED',
      packagePlanVersionId: PLAN_VERSION_ID,
    });

    prisma.packagePlanVersion.findUnique.mockResolvedValue({
      id: PLAN_VERSION_ID,
      activePackageMode: 'MULTIPLE_ACTIVE',
      activationTrigger: 'PAYMENT_APPROVED',
    });

    const activationResult = {
      created: true,
      message: 'Package activated.',
      subscription: {
        id: '44444444-4444-4444-8444-444444444444',
      },
    } as unknown as Awaited<
      ReturnType<SubscriptionsService['activateFromApprovedDeposit']>
    >;

    const activationSpy = jest
      .spyOn(service, 'activateFromApprovedDeposit')
      .mockResolvedValue(activationResult);

    const result = await service.activateAutomaticallyAfterAccounting(
      DEPOSIT_ID,
      actor,
    );

    expect(result).toMatchObject({
      activationMode: 'AUTO',
      activationTrigger: 'PAYMENT_APPROVED',
      activePackageMode: 'MULTIPLE_ACTIVE',
      activationApplied: true,
      activationRequired: false,
      created: true,
    });

    expect(activationSpy).toHaveBeenCalledWith(
      DEPOSIT_ID,
      actor,
      {},
      SUBSCRIPTION_AUDIT_OPERATIONS.AUTO_ACTIVATE_AFTER_ACCOUNTING,
      ['PAYMENT_APPROVED'],
    );
  });

  it('does not guess execution for future RULE_BASED activation', async () => {
    prisma.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      status: 'APPROVED',
      packagePlanVersionId: PLAN_VERSION_ID,
    });

    prisma.packagePlanVersion.findUnique.mockResolvedValue({
      id: PLAN_VERSION_ID,
      activePackageMode: 'MULTIPLE_ACTIVE',
      activationTrigger: 'RULE_BASED',
    });

    const activationSpy = jest.spyOn(service, 'activateFromApprovedDeposit');

    const result = await service.activateAutomaticallyAfterAccounting(
      DEPOSIT_ID,
      actor,
    );

    expect(result).toMatchObject({
      activationMode: 'DEFERRED',
      activationTrigger: 'RULE_BASED',
      activationApplied: false,
      activationRequired: true,
    });

    expect(activationSpy).not.toHaveBeenCalled();
  });
});
