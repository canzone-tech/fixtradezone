import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import {
  PackagesController,
  PublicPackagesController,
} from './packages.controller';
import { PackagesService } from './packages.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_DEFINITION_ID = '22222222-2222-4222-8222-222222222222';
const AVAILABLE_DEFINITION_ID = '33333333-3333-4333-8333-333333333333';

const actor = {
  id: USER_ID,
  roles: ['USER'],
} as AuthenticatedUser;

const catalogue = {
  catalogueAvailable: true,
  activationAvailable: true,
  reason: 'PACKAGE_ACTIVATION_AVAILABLE',
  plan: { versionNumber: 1 },
  items: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      packageDefinitionId: ACTIVE_DEFINITION_ID,
      displayName: 'FTZ AlphaBot',
      slug: 'ftz-alphabot',
      sortOrder: 1,
      availability: 'PUBLIC',
      price: '100.00000000',
      minimumInvestment: '100.00000000',
      maximumInvestment: '500.00000000',
      rangeConfigured: true,
      durationDays: 30,
      currency: 'USDT',
      rewardRateMode: 'FIXED',
      fixedRewardRate: '1.000000',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      packageDefinitionId: AVAILABLE_DEFINITION_ID,
      displayName: 'FTZ BetaBot',
      slug: 'ftz-betabot',
      sortOrder: 2,
      availability: 'PUBLIC',
      price: '500.00000000',
      minimumInvestment: '500.00000000',
      maximumInvestment: '1000.00000000',
      rangeConfigured: true,
      durationDays: 45,
      currency: 'USDT',
      rewardRateMode: 'FIXED',
      fixedRewardRate: '1.250000',
    },
  ],
};

describe('PublicPackagesController', () => {
  const packagesService = {
    getEffectiveCatalogue: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    packagesService.getEffectiveCatalogue.mockResolvedValue(catalogue);
  });

  it('returns only landing-safe package fields', async () => {
    const controller = new PublicPackagesController(
      packagesService as unknown as PackagesService,
    );

    const result = await controller.getCatalogue();

    expect(result.catalogueAvailable).toBe(true);
    expect(result.items[0]).toEqual({
      displayName: 'FTZ AlphaBot',
      slug: 'ftz-alphabot',
      sortOrder: 1,
      availability: 'PUBLIC',
      price: '100.00000000',
      minimumInvestment: '100.00000000',
      maximumInvestment: '500.00000000',
      rangeConfigured: true,
      durationDays: 30,
      currency: 'USDT',
    });
    expect(result.items[0]).not.toHaveProperty('rewardRateMode');
    expect(result.items[0]).not.toHaveProperty('fixedRewardRate');
    expect(result.items[0]).not.toHaveProperty('packageDefinitionId');
  });
});

describe('PackagesController funding eligibility', () => {
  const packagesService = {
    getEffectiveCatalogue: jest.fn(),
  };
  const prisma = {
    $queryRaw: jest.fn(),
  };

  let controller: PackagesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PackagesController(
      packagesService as unknown as PackagesService,
      prisma as unknown as PrismaService,
    );
    packagesService.getEffectiveCatalogue.mockResolvedValue(catalogue);
  });

  it('removes only ACTIVE package definitions from the user funding catalogue', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { packageDefinitionId: ACTIVE_DEFINITION_ID },
    ]);

    const result = await controller.getEffectiveCatalogue(actor);

    expect(result.items).toEqual([
      expect.objectContaining({
        packageDefinitionId: AVAILABLE_DEFINITION_ID,
        displayName: 'FTZ BetaBot',
      }),
    ]);
  });

  it('leaves different packages available when the user has no matching ACTIVE package', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await controller.getEffectiveCatalogue(actor);

    expect(result.items).toHaveLength(2);
  });
});
