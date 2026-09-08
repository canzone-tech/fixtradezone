import { ConflictException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { DepositsService } from './deposits.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const DEFINITION_ID = '44444444-4444-4444-8444-444444444444';
const RAIL_ID = '77777777-7777-4777-8777-777777777777';

const actor = {
  id: USER_ID,
  roles: ['USER'],
} as AuthenticatedUser;

describe('DepositsService active-package funding guard', () => {
  const transaction = {
    deposit: {
      findUnique: jest.fn(),
    },
    packagePlanVersion: {
      findMany: jest.fn(),
    },
    depositPaymentRail: {
      findFirst: jest.fn(),
    },
    depositAccount: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: DepositsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DepositsService(prisma as unknown as PrismaService);
    transaction.deposit.findUnique.mockResolvedValue(null);
    transaction.packagePlanVersion.findMany.mockResolvedValue([
      {
        id: PLAN_ID,
        activationTrigger: 'PAYMENT_APPROVED',
        items: [
          {
            id: ITEM_ID,
            packageDefinition: {
              id: DEFINITION_ID,
              code: 'NEURAL_SCOUT',
            },
          },
        ],
      },
    ]);
  });

  it('rejects a new deposit before rail assignment when the same package is ACTIVE', async () => {
    transaction.$queryRaw.mockResolvedValue([
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ]);

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '5',
        },
        actor,
      ),
    ).rejects.toThrow(
      'You already have an active subscription for this package.',
    );

    await expect(
      service.createDeposit(
        {
          packagePlanItemId: ITEM_ID,
          paymentRailId: RAIL_ID,
          investmentAmount: '5',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.$queryRaw).toHaveBeenCalled();
    expect(transaction.depositPaymentRail.findFirst).not.toHaveBeenCalled();
    expect(transaction.depositAccount.findMany).not.toHaveBeenCalled();
  });
});
