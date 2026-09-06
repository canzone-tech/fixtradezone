import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PackageDraftService } from './package-draft.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_PLAN_ID = '22222222-2222-4222-8222-222222222222';
const DRAFT_PLAN_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';
const DEFINITION_ID = '55555555-5555-4555-8555-555555555555';
const CREATED_AT = new Date('2026-09-06T00:00:00.000Z');

const actor: AuthenticatedUser = {
  id: USER_ID,
  email: 'admin@example.com',
  username: 'admin',
  phone: null,
  firstName: 'Admin',
  lastName: null,
  status: 'ACTIVE',
  createdAt: CREATED_AT,
  lastLoginAt: null,
  roles: ['ADMIN'],
  permissions: ['packages.read', 'packages.draft.manage'],
};

function item() {
  return {
    id: ITEM_ID,
    planVersionId: SOURCE_PLAN_ID,
    packageDefinitionId: DEFINITION_ID,
    displayName: 'Database Package',
    slug: 'database-package',
    sortOrder: 1,
    availability: 'AVAILABLE' as const,
    price: new Prisma.Decimal('5.00000000'),
    minimumInvestment: new Prisma.Decimal('5.00000000'),
    maximumInvestment: new Prisma.Decimal('24.00000000'),
    durationDays: 10,
    currency: 'USDT',
    rewardRateMode: 'RANDOM_RANGE' as const,
    fixedRewardRate: null,
    minimumRewardRate: new Prisma.Decimal('0.400000'),
    maximumRewardRate: new Prisma.Decimal('0.600000'),
    rewardRateMeaning: 'USER_NET_AFTER_SPLIT' as const,
    capBasis: 'PROFIT_ONLY' as const,
    capMultiplier: new Prisma.Decimal('1.0000'),
    principalTreatment: 'RETURN_SEPARATELY' as const,
    goalDays: 10,
    cycleDays: 10,
    rewardStartMode: 'NEXT_CALENDAR_DAY' as const,
    rewardFrequency: 'DAILY_CALENDAR' as const,
    cycleDayMode: 'CALENDAR_DAYS' as const,
    rewardDayMode: 'EVERY_DAY' as const,
    cycleEndAction: 'COMPLETE_PACKAGE' as const,
    capReachedAction: 'COMPLETE_PACKAGE' as const,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    packageDefinition: {
      id: DEFINITION_ID,
      code: 'DB_PACKAGE',
      createdAt: CREATED_AT,
    },
  };
}

function plan(
  overrides: Record<string, unknown> = {},
  items: ReturnType<typeof item>[] = [],
) {
  return {
    id: DRAFT_PLAN_ID,
    versionNumber: 1,
    status: 'DRAFT' as const,
    revision: 1,
    activePackageMode: 'SINGLE_ACTIVE' as const,
    multipleActivePackageBasis: 'HIGHEST_ACTIVE_PACKAGE' as const,
    activationTrigger: 'PAYMENT_APPROVED' as const,
    migrationMode: 'NEW_PACKAGE_ACTIVATIONS' as const,
    renewalMode: 'MANUAL_AFTER_TERMINAL' as const,
    upgradesEnabled: false,
    settlementTimezone: 'UTC',
    effectiveFrom: null,
    effectiveTo: null,
    publishedAt: null,
    clonedFromPlanVersionId: null,
    createdByUserId: USER_ID,
    updatedByUserId: USER_ID,
    publishedByUserId: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    items,
    ...overrides,
  };
}

describe('PackageDraftService', () => {
  const transaction = {
    packagePlanVersion: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: PackageDraftService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PackageDraftService(prisma as unknown as PrismaService);
    transaction.auditLog.create.mockResolvedValue({ id: 'audit' });
  });

  it('creates an empty V1 draft when no package-plan history exists', async () => {
    transaction.packagePlanVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    transaction.packagePlanVersion.create.mockResolvedValue(plan());

    const result = await service.createDraft(
      { reason: 'Initialize database-backed catalogue' },
      actor,
    );

    expect(transaction.packagePlanVersion.create).toHaveBeenCalledWith({
      data: {
        versionNumber: 1,
        status: 'DRAFT',
        revision: 1,
        createdByUserId: USER_ID,
        updatedByUserId: USER_ID,
      },
      include: expect.any(Object),
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            operation: 'CREATE_INITIAL_DRAFT',
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      message: 'Package plan V1 initial draft created.',
      plan: { versionNumber: 1, status: 'DRAFT', items: [] },
    });
  });

  it('requires a published source once package-plan history exists', async () => {
    transaction.packagePlanVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ versionNumber: 1 });

    await expect(
      service.createDraft({ reason: 'Create next version' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.packagePlanVersion.create).not.toHaveBeenCalled();
  });

  it('clones all commercial range and duration fields from a published source', async () => {
    const sourceItem = item();
    const source = plan(
      {
        id: SOURCE_PLAN_ID,
        status: 'PUBLISHED',
        effectiveFrom: CREATED_AT,
        publishedAt: CREATED_AT,
      },
      [sourceItem],
    );
    const cloned = plan(
      {
        id: DRAFT_PLAN_ID,
        versionNumber: 2,
        clonedFromPlanVersionId: SOURCE_PLAN_ID,
      },
      [
        {
          ...sourceItem,
          planVersionId: DRAFT_PLAN_ID,
        },
      ],
    );

    transaction.packagePlanVersion.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ versionNumber: 1 });
    transaction.packagePlanVersion.findUnique.mockResolvedValue(source);
    transaction.packagePlanVersion.create.mockResolvedValue(cloned);

    await service.createDraft(
      {
        sourcePlanVersionId: SOURCE_PLAN_ID,
        reason: 'Create successor from published database terms',
      },
      actor,
    );

    const createCall = transaction.packagePlanVersion.create.mock.calls[0][0];
    expect(createCall.data.items.create).toHaveLength(1);
    expect(createCall.data.items.create[0]).toMatchObject({
      packageDefinitionId: DEFINITION_ID,
      minimumInvestment: sourceItem.minimumInvestment,
      maximumInvestment: sourceItem.maximumInvestment,
      durationDays: 10,
    });
  });
});
