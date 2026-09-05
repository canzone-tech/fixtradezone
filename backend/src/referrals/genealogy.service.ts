import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  AdminGenealogyPageQueryDto,
  AdminGenealogySearchQueryDto,
  GenealogyPageQueryDto,
} from './dto/genealogy-query.dto';

const CONFIG_ID = 1;
const MAX_GENEALOGY_DEPTH = 1000;

interface ActivePackageCountRow {
  userId: string;
  total: bigint | number | string;
}

interface GenealogyProfileRow {
  userId: string;
  referralCode: string;
  sponsorUserId: string | null;
  assignmentStatus: string;
  assignedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    createdAt: Date;
  };
}

@Injectable()
export class GenealogyService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(user: AuthenticatedUser, query: GenealogyPageQueryDto) {
    const rootUserId = user.id;
    const parentUserId = query.parentUserId ?? rootUserId;
    const level = await this.assertDescendantOrSelf(rootUserId, parentUserId);

    return this.readPage(
      rootUserId,
      parentUserId,
      level,
      query.page,
      query.limit,
    );
  }

  async getAdmin(query: AdminGenealogyPageQueryDto) {
    const rootUserId = query.rootUserId ?? (await this.getConfiguredRootUserId());
    const parentUserId = query.parentUserId ?? rootUserId;
    const level = await this.assertDescendantOrSelf(rootUserId, parentUserId);

    return this.readPage(
      rootUserId,
      parentUserId,
      level,
      query.page,
      query.limit,
    );
  }

  async searchAdmin(query: AdminGenealogySearchQueryDto) {
    const term = query.query.trim();
    const profiles = await this.prisma.referralProfile.findMany({
      where: {
        user: {
          OR: [
            { username: { contains: term } },
            { email: { contains: term } },
            { firstName: { contains: term } },
            { lastName: { contains: term } },
          ],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
      take: 20,
      select: {
        userId: true,
        referralCode: true,
        sponsorUserId: true,
        assignmentStatus: true,
        assignedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    const userIds = profiles.map((profile) => profile.userId);
    const [directCounts, packageCounts] = await Promise.all([
      this.loadDirectReferralCounts(userIds),
      this.loadActivePackageCounts(userIds),
    ]);

    return {
      items: profiles.map((profile) => ({
        id: profile.user.id,
        username: profile.user.username,
        email: profile.user.email,
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        status: profile.user.status,
        referralCode: profile.referralCode,
        assignmentStatus: profile.assignmentStatus,
        sponsorUserId: profile.sponsorUserId,
        directReferralCount: directCounts.get(profile.userId) ?? 0,
        activePackageCount: packageCounts.get(profile.userId) ?? 0,
      })),
    };
  }

  private async readPage(
    rootUserId: string,
    parentUserId: string,
    level: number,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const [parentProfile, children, total] = await this.prisma.$transaction([
      this.prisma.referralProfile.findUnique({
        where: { userId: parentUserId },
        select: this.profileSelect(),
      }),
      this.prisma.referralProfile.findMany({
        where: { sponsorUserId: parentUserId },
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
        skip,
        take: limit,
        select: this.profileSelect(),
      }),
      this.prisma.referralProfile.count({
        where: { sponsorUserId: parentUserId },
      }),
    ]);

    if (!parentProfile) {
      throw new NotFoundException('Genealogy member is not enrolled.');
    }

    const allUserIds = [
      parentProfile.userId,
      ...children.map((child) => child.userId),
    ];
    const [directCounts, packageCounts] = await Promise.all([
      this.loadDirectReferralCounts(allUserIds),
      this.loadActivePackageCounts(allUserIds),
    ]);

    return {
      rootUserId,
      level,
      parent: this.toNode(parentProfile, directCounts, packageCounts),
      children: children.map((child) =>
        this.toNode(child, directCounts, packageCounts),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private profileSelect() {
    return {
      userId: true,
      referralCode: true,
      sponsorUserId: true,
      assignmentStatus: true,
      assignedAt: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      },
    } as const;
  }

  private toNode(
    profile: GenealogyProfileRow,
    directCounts: Map<string, number>,
    packageCounts: Map<string, number>,
  ) {
    const directReferralCount = directCounts.get(profile.userId) ?? 0;
    const activePackageCount = packageCounts.get(profile.userId) ?? 0;

    return {
      id: profile.user.id,
      username: profile.user.username,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      status: profile.user.status,
      referralCode: profile.referralCode,
      assignmentStatus: profile.assignmentStatus,
      sponsorUserId: profile.sponsorUserId,
      assignedAt: profile.assignedAt,
      referralJoinedAt: profile.createdAt,
      accountCreatedAt: profile.user.createdAt,
      directReferralCount,
      hasChildren: directReferralCount > 0,
      activePackageCount,
      hasActivePackage: activePackageCount > 0,
    };
  }

  private async assertDescendantOrSelf(
    ancestorUserId: string,
    candidateUserId: string,
  ): Promise<number> {
    if (ancestorUserId === candidateUserId) {
      return 0;
    }

    const visited = new Set<string>();
    let currentUserId = candidateUserId;

    for (let depth = 1; depth <= MAX_GENEALOGY_DEPTH; depth += 1) {
      if (visited.has(currentUserId)) {
        break;
      }
      visited.add(currentUserId);

      const profile = await this.prisma.referralProfile.findUnique({
        where: { userId: currentUserId },
        select: { sponsorUserId: true },
      });

      const sponsorUserId = profile?.sponsorUserId ?? null;
      if (!sponsorUserId) {
        break;
      }
      if (sponsorUserId === ancestorUserId) {
        return depth;
      }
      currentUserId = sponsorUserId;
    }

    throw new ForbiddenException(
      'Requested genealogy member is outside the permitted referral subtree.',
    );
  }

  private async getConfiguredRootUserId(): Promise<string> {
    const config = await this.prisma.systemReferralConfig.findUnique({
      where: { id: CONFIG_ID },
      select: { primaryRootUserId: true },
    });

    if (!config?.primaryRootUserId) {
      throw new NotFoundException('Primary referral root is not configured.');
    }

    return config.primaryRootUserId;
  }

  private async loadDirectReferralCounts(
    userIds: string[],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.referralProfile.groupBy({
      by: ['sponsorUserId'],
      where: { sponsorUserId: { in: userIds } },
      _count: { _all: true },
    });

    return new Map(
      rows.flatMap((row) =>
        row.sponsorUserId ? [[row.sponsorUserId, row._count._all] as const] : [],
      ),
    );
  }

  private async loadActivePackageCounts(
    userIds: string[],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<ActivePackageCountRow[]>(Prisma.sql`
      SELECT userId, COUNT(*) AS total
      FROM user_package_subscriptions
      WHERE status = 'ACTIVE'
        AND userId IN (${Prisma.join(userIds)})
      GROUP BY userId
    `);

    return new Map(
      rows.map((row) => [row.userId, this.countNumber(row.total)] as const),
    );
  }

  private countNumber(value: bigint | number | string | undefined): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'number') {
      return value;
    }
    return Number(value ?? 0);
  }
}
