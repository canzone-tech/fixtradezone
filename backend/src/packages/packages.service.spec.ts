import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UpdatePackagePlanItemDto } from './dto/package-plan.dto';
import { PackagesService } from './packages.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const DEFINITION_ID = '44444444-4444-4444-8444-444444444444';

const superAdmin: AuthenticatedUser = {
  id: USER_ID,
  email: 'founder@example.com',
  username: 'founder',
  phone: null,
  firstName: 'Founder',
  lastName: null,
  status: 'ACTIVE',
  createdAt: new Date('2026-08-25T00:00:00.000Z'),
  lastLoginAt: null,
  roles: ['SUPER_ADMIN'],
  permissions: [],
};

const admin: AuthenticatedUser = {
  ...superAdmin,
  roles: ['ADMIN'],
  permissions: ['packages.read', 'packages.draft.manage'],
};

function packageItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    planVersionId: PLAN_ID,
    packageDefinitionId: DEFINITION_ID,
    displayName: 'Neural Scout',
    slug: 'neural-scout',
    sortOrder: 1,
    availability: 'AVAILABLE',
    price: new Prisma.Decimal('5.00000000'),
    currency: 'USDT',
    rewardRateMode: 'RANDOM_RANGE',
    fixedRewardRate: null,
    minimumRewardRate: new Prisma.Decimal('0.400000'),
    maximumRewardRate: new Prisma.Decimal('0.600000'),
    rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
    capBasis: 'TOTAL_RETURN',
    capMultiplier: new Prisma.Decimal('2.0000'),
    principalTreatment: 'INCLUDED_IN_TOTAL_RETURN',
    goalDays: 90,
    cycleDays: 10,
    rewardStartMode: 'NEXT_CALENDAR_DAY',
    rewardFrequency: 'DAILY_CALENDAR',
    cycleDayMode: 'CALENDAR_DAYS',
    rewardDayMode: 'EVERY_DAY',
    cycleEndAction: 'AUTO_START_NEXT_CYCLE',
    capReachedAction: 'COMPLETE_PACKAGE',
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    packageDefinition: {
      id: DEFINITION_ID,
      code: 'NEURAL_SCOUT',
      createdAt: new Date('2026-08-25T00:00:00.000Z'),
    },
    ...overrides,
  };
}

function packagePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    versionNumber: 1,
    status: 'DRAFT',
    revision: 1,
    activePackageMode: 'SINGLE_ACTIVE',
    multipleActivePackageBasis: 'HIGHEST_ACTIVE_PACKAGE',
    activationTrigger: 'PAYMENT_APPROVED',
    migrationMode: 'NEW_PACKAGE_ACTIVATIONS',
    renewalMode: 'MANUAL_AFTER_TERMINAL',
    upgradesEnabled: false,
    settlementTimezone: 'UTC',
    effectiveFrom: null,
    effectiveTo: null,
    publishedAt: null,
    clonedFromPlanVersionId: null,
    createdByUserId: null,
    updatedByUserId: null,
    publishedByUserId: null,
    createdAt: new Date('2026-08-25T00:00:00.000Z'),
    updatedAt: new Date('2026-08-25T00:00:00.000Z'),
    items: [packageItem()],
    ...overrides,
  };
}

describe('PackagesService', () => {
  const transaction = {
    packagePlanVersion: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    packageDefinition: {
      findUnique: jest.fn(),
    },
    packagePlanItem: {
      create: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    packagePlanVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (operation: (client: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    ),
  };

  let service: PackagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PackagesService(prisma as unknown as PrismaService);
  });

  it('returns an explicit safe empty catalogue before first publication', async () => {
    prisma.packagePlanVersion.findMany.mockResolvedValue([]);

    await expect(service.getEffectiveCatalogue()).resolves.toEqual({
      catalogueAvailable: false,
      activationAvailable: false,
      reason: 'NO_EFFECTIVE_PUBLISHED_PLAN',
      plan: null,
      items: [],
    });
  });

  it('serializes exact decimals and hides HIDDEN items from the user catalogue', async () => {
    prisma.packagePlanVersion.findMany.mockResolvedValue([
      packagePlan({
        status: 'PUBLISHED',
        revision: 2,
        effectiveFrom: new Date('2026-08-25T00:00:00.000Z'),
        publishedAt: new Date('2026-08-25T00:00:00.000Z'),
        publishedByUserId: USER_ID,
        items: [
          packageItem(),
          packageItem({
            id: '55555555-5555-4555-8555-555555555555',
            availability: 'HIDDEN',
            packageDefinition: {
              id: '66666666-6666-4666-8666-666666666666',
              code: 'HIDDEN_PACKAGE',
              createdAt: new Date('2026-08-25T00:00:00.000Z'),
            },
          }),
        ],
      }),
    ]);

    const result = await service.getEffectiveCatalogue(
      new Date('2026-08-25T01:00:00.000Z'),
    );

    expect(result.catalogueAvailable).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      price: '5.00000000',
      minimumRewardRate: '0.400000',
      capMultiplier: '2.0000',
      maximumTotalReturn: '10.00000000',
      maximumProfit: '5.00000000',
    });
  });

  it('fails closed if effective published plans overlap', async () => {
    prisma.packagePlanVersion.findMany.mockResolvedValue([
      packagePlan(),
      packagePlan({ id: '77777777-7777-4777-8777-777777777777' }),
    ]);

    await expect(service.getEffectiveCatalogue()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects a stale draft item mutation before changing state', async () => {
    transaction.packagePlanVersion.findUnique.mockResolvedValue(
      packagePlan({ revision: 3 }),
    );

    await expect(
      service.updatePlanItem(
        PLAN_ID,
        ITEM_ID,
        {
          expectedRevision: 2,
          reason: 'Update reviewed availability.',
          availability: 'CLOSED_TO_NEW_ACTIVATIONS',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.packagePlanVersion.updateMany).not.toHaveBeenCalled();
    expect(transaction.packagePlanItem.update).not.toHaveBeenCalled();
  });

  it('updates a draft item, aggregate revision and audit in one transaction', async () => {
    const plan = packagePlan();
    const updatedItem = packageItem({
      availability: 'CLOSED_TO_NEW_ACTIVATIONS',
    });

    transaction.packagePlanVersion.findUnique.mockResolvedValue(plan);
    transaction.packagePlanVersion.updateMany.mockResolvedValue({ count: 1 });
    transaction.packagePlanItem.update.mockResolvedValue(updatedItem);
    transaction.auditLog.create.mockResolvedValue({});

    const result = await service.updatePlanItem(
      PLAN_ID,
      ITEM_ID,
      {
        expectedRevision: 1,
        reason: 'Close this package for reviewed operational reasons.',
        availability: 'CLOSED_TO_NEW_ACTIVATIONS',
      },
      admin,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result).toMatchObject({
      revision: 2,
      item: { availability: 'CLOSED_TO_NEW_ACTIVATIONS' },
    });
    expect(transaction.packagePlanVersion.updateMany).toHaveBeenCalledWith({
      where: { id: PLAN_ID, revision: 1, status: 'DRAFT' },
      data: {
        revision: { increment: 1 },
        updatedByUserId: USER_ID,
      },
    });
    const auditCalls = transaction.auditLog.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            action: string;
            metadata: { operation: string; revision: number };
          };
        },
      ]
    >;

    expect(auditCalls[0]?.[0].data.action).toBe('UPDATE');
    expect(auditCalls[0]?.[0].data.metadata).toMatchObject({
      operation: 'UPDATE_DRAFT_ITEM',
      revision: 2,
    });
  });

  it('preserves omitted nullable rates on a transformed partial-update DTO', async () => {
    const plan = packagePlan();
    const updatedItem = packageItem({
      availability: 'CLOSED_TO_NEW_ACTIVATIONS',
    });
    const dto = plainToInstance(UpdatePackagePlanItemDto, {
      expectedRevision: 1,
      reason: 'Close this package while preserving its approved rate range.',
      availability: 'CLOSED_TO_NEW_ACTIVATIONS',
    });

    const hasTransformedRateField = Object.prototype.hasOwnProperty.call(
      dto,
      'minimumRewardRate',
    );

    expect(hasTransformedRateField).toBe(true);
    expect(dto.minimumRewardRate).toBeUndefined();

    transaction.packagePlanVersion.findUnique.mockResolvedValue(plan);
    transaction.packagePlanVersion.updateMany.mockResolvedValue({ count: 1 });
    transaction.packagePlanItem.update.mockResolvedValue(updatedItem);
    transaction.auditLog.create.mockResolvedValue({});

    await expect(
      service.updatePlanItem(PLAN_ID, ITEM_ID, dto, admin),
    ).resolves.toMatchObject({
      revision: 2,
      item: { availability: 'CLOSED_TO_NEW_ACTIVATIONS' },
    });

    const updateCalls = transaction.packagePlanItem.update.mock
      .calls as unknown as Array<
      [
        {
          data: {
            fixedRewardRate: Prisma.Decimal | null;
            minimumRewardRate: Prisma.Decimal;
            maximumRewardRate: Prisma.Decimal;
          };
        },
      ]
    >;
    const updateCall = updateCalls[0]?.[0];

    expect(updateCall?.data.fixedRewardRate).toBeNull();
    expect(updateCall?.data.minimumRewardRate.toFixed(6)).toBe('0.400000');
    expect(updateCall?.data.maximumRewardRate.toFixed(6)).toBe('0.600000');
  });

  it('rejects a rate mode whose typed decimal fields do not match', async () => {
    transaction.packagePlanVersion.findUnique.mockResolvedValue(packagePlan());

    await expect(
      service.updatePlanItem(
        PLAN_ID,
        ITEM_ID,
        {
          expectedRevision: 1,
          reason: 'Switch to a reviewed fixed rate.',
          rewardRateMode: 'FIXED',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.packagePlanVersion.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a total-return cap that cannot include the principal', async () => {
    transaction.packagePlanVersion.findUnique.mockResolvedValue(packagePlan());

    await expect(
      service.updatePlanItem(
        PLAN_ID,
        ITEM_ID,
        {
          expectedRevision: 1,
          reason: 'Attempt an invalid total-return multiplier.',
          capMultiplier: '0.5000',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.packagePlanVersion.updateMany).not.toHaveBeenCalled();
  });

  it('requires SUPER_ADMIN authority for publication in the service layer', async () => {
    await expect(
      service.publishPlanVersion(
        PLAN_ID,
        {
          expectedRevision: 1,
          reason: 'Attempt unauthorized publication.',
        },
        admin,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks publication while upgrades are enabled without dependent modules', async () => {
    transaction.packagePlanVersion.findUnique.mockResolvedValue(
      packagePlan({ upgradesEnabled: true }),
    );

    await expect(
      service.publishPlanVersion(
        PLAN_ID,
        {
          expectedRevision: 1,
          reason: 'Founder publication review.',
        },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.packagePlanVersion.updateMany).not.toHaveBeenCalled();
  });

  it('atomically closes the active predecessor and publishes the reviewed draft', async () => {
    const effectiveFrom = new Date(Date.now() + 60_000);
    const predecessor = packagePlan({
      id: '88888888-8888-4888-8888-888888888888',
      versionNumber: 1,
      status: 'PUBLISHED',
      revision: 2,
      effectiveFrom: new Date('2026-08-24T00:00:00.000Z'),
      publishedAt: new Date('2026-08-24T00:00:00.000Z'),
      publishedByUserId: USER_ID,
    });
    const predecessorAfter = {
      ...predecessor,
      revision: 3,
      effectiveTo: effectiveFrom,
    };
    const draft = packagePlan({ versionNumber: 2 });
    const published = {
      ...draft,
      status: 'PUBLISHED',
      revision: 2,
      effectiveFrom,
      publishedAt: new Date(),
      publishedByUserId: USER_ID,
      updatedByUserId: USER_ID,
    };

    transaction.packagePlanVersion.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(predecessorAfter)
      .mockResolvedValueOnce(published);
    transaction.packagePlanVersion.findMany.mockResolvedValue([predecessor]);
    transaction.packagePlanVersion.update.mockResolvedValue(predecessorAfter);
    transaction.packagePlanVersion.updateMany.mockResolvedValue({ count: 1 });
    transaction.auditLog.create.mockResolvedValue({});

    const result = await service.publishPlanVersion(
      PLAN_ID,
      {
        expectedRevision: 1,
        reason: 'Founder reviewed the complete V2 plan.',
        effectiveFrom: effectiveFrom.toISOString(),
      },
      superAdmin,
    );

    expect(result.plan).toMatchObject({
      status: 'PUBLISHED',
      revision: 2,
    });
    expect(transaction.packagePlanVersion.update).toHaveBeenCalledWith({
      where: { id: predecessor.id },
      data: {
        effectiveTo: effectiveFrom,
        updatedByUserId: USER_ID,
        revision: { increment: 1 },
      },
    });
    const auditCalls = transaction.auditLog.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            action: string;
            metadata: { operation: string };
          };
        },
      ]
    >;

    expect(auditCalls[0]?.[0].data.metadata.operation).toBe(
      'AUTO_CLOSE_FOR_PUBLISH',
    );
    expect(auditCalls[1]?.[0].data.action).toBe('APPROVE');
    expect(auditCalls[1]?.[0].data.metadata.operation).toBe('PUBLISH');
  });

  it('does not allow published commercial terms to be edited', async () => {
    transaction.packagePlanVersion.findUnique.mockResolvedValue(
      packagePlan({
        status: 'PUBLISHED',
        revision: 2,
        effectiveFrom: new Date('2026-08-25T00:00:00.000Z'),
        publishedAt: new Date('2026-08-25T00:00:00.000Z'),
        publishedByUserId: USER_ID,
      }),
    );

    await expect(
      service.updatePlanVersion(
        PLAN_ID,
        {
          expectedRevision: 2,
          reason: 'Attempt to mutate a published trigger.',
          activationTrigger: 'MANUAL_ACTIVATION',
        },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.packagePlanVersion.updateMany).not.toHaveBeenCalled();
  });

  it('allows only one active package-plan draft', async () => {
    transaction.packagePlanVersion.findFirst.mockResolvedValue({
      id: PLAN_ID,
      versionNumber: 1,
    });

    await expect(
      service.createDraft(
        {
          sourcePlanVersionId: PLAN_ID,
          reason: 'Clone the latest published plan.',
        },
        superAdmin,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.packagePlanVersion.create).not.toHaveBeenCalled();
  });
});
