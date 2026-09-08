import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_DEFINITION_ID = '22222222-2222-4222-8222-222222222222';
const AVAILABLE_DEFINITION_ID = '33333333-3333-4333-8333-333333333333';

const actor = {
  id: USER_ID,
  roles: ['USER'],
} as AuthenticatedUser;

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
    packagesService.getEffectiveCatalogue.mockResolvedValue({
      catalogueAvailable: true,
      activationAvailable: true,
      reason: 'PACKAGE_ACTIVATION_AVAILABLE',
      plan: { versionNumber: 1 },
      items: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          packageDefinitionId: ACTIVE_DEFINITION_ID,
          displayName: 'FTZ AlphaBot',
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          packageDefinitionId: AVAILABLE_DEFINITION_ID,
          displayName: 'FTZ BetaBot',
        },
      ],
    });
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
