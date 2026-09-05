import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GenealogyService } from './genealogy.service';

const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDE_ID = '33333333-3333-4333-8333-333333333333';

function profile(userId: string, sponsorUserId: string | null) {
  return {
    userId,
    referralCode: `FTZ-${userId.slice(0, 4)}`,
    sponsorUserId,
    assignmentStatus: sponsorUserId ? 'ASSIGNED' : 'ROOT',
    assignedAt: new Date('2026-09-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    user: {
      id: userId,
      username: userId === ROOT_ID ? 'root' : 'child',
      firstName: null,
      lastName: null,
      status: 'ACTIVE',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  };
}

describe('GenealogyService', () => {
  const prisma = {
    referralProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    systemReferralConfig: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  };

  const user: AuthenticatedUser = {
    id: ROOT_ID,
    email: 'root@example.com',
    username: 'root',
    phone: null,
    firstName: null,
    lastName: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    lastLoginAt: null,
    roles: ['USER'],
    permissions: [],
  };

  let service: GenealogyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GenealogyService(prisma as unknown as PrismaService);
  });

  it('returns a lazy root page with direct and active-package indicators', async () => {
    prisma.referralProfile.findUnique.mockResolvedValue(profile(ROOT_ID, null));
    prisma.referralProfile.findMany.mockResolvedValue([
      profile(CHILD_ID, ROOT_ID),
    ]);
    prisma.referralProfile.count.mockResolvedValue(1);
    prisma.referralProfile.groupBy.mockResolvedValue([
      { sponsorUserId: ROOT_ID, _count: { _all: 1 } },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { userId: CHILD_ID, total: BigInt(2) },
    ]);

    const result = await service.getMine(user, {
      page: 1,
      limit: 25,
    });

    expect(result.rootUserId).toBe(ROOT_ID);
    expect(result.parent.id).toBe(ROOT_ID);
    expect(result.parent.directReferralCount).toBe(1);
    expect(result.children).toHaveLength(1);
    expect(result.children[0]).toMatchObject({
      id: CHILD_ID,
      activePackageCount: 2,
      hasActivePackage: true,
    });
  });

  it('rejects traversal to a member outside the current users subtree', async () => {
    prisma.referralProfile.findUnique.mockResolvedValue({
      sponsorUserId: null,
    });

    await expect(
      service.getMine(user, {
        parentUserId: OUTSIDE_ID,
        page: 1,
        limit: 25,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.referralProfile.findMany).not.toHaveBeenCalled();
  });

  it('uses the configured primary root for the admin explorer when no root is supplied', async () => {
    prisma.systemReferralConfig.findUnique.mockResolvedValue({
      primaryRootUserId: ROOT_ID,
    });
    prisma.referralProfile.findUnique.mockResolvedValue(profile(ROOT_ID, null));
    prisma.referralProfile.findMany.mockResolvedValue([]);
    prisma.referralProfile.count.mockResolvedValue(0);
    prisma.referralProfile.groupBy.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.getAdmin({ page: 1, limit: 25 });

    expect(result.rootUserId).toBe(ROOT_ID);
    expect(result.parent.id).toBe(ROOT_ID);
    expect(result.children).toEqual([]);
  });
});
