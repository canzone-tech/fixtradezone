import { Controller, Get, Header } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PackagesService } from './packages.service';

interface PublicPackageNetworkRow {
  packageDefinitionId: string;
  networkCode: string;
}

function packageDefinitionIdFrom(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const packageDefinitionId = candidate['packageDefinitionId'];
  return typeof packageDefinitionId === 'string' ? packageDefinitionId : null;
}

function compactRate(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed || '0';
}

function dailyRateLabel(item: {
  rewardRateMode: string;
  fixedRewardRate: string | null;
  minimumRewardRate: string | null;
  maximumRewardRate: string | null;
}): string | null {
  if (item.rewardRateMode === 'FIXED') {
    const rate = compactRate(item.fixedRewardRate);
    return rate === null ? null : `${rate}%`;
  }

  if (item.rewardRateMode === 'RANDOM_RANGE') {
    const minimum = compactRate(item.minimumRewardRate);
    const maximum = compactRate(item.maximumRewardRate);
    return minimum === null || maximum === null
      ? null
      : `${minimum}–${maximum}%`;
  }

  return null;
}

@Controller('public/packages')
export class PublicPackagesController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async getCatalogue() {
    const catalogue = await this.packagesService.getEffectiveCatalogue();

    const networkRows =
      catalogue.items.length === 0
        ? []
        : await this.prisma.$queryRaw<PublicPackageNetworkRow[]>(Prisma.sql`
            SELECT
              routes.packageDefinitionId,
              rails.networkCode
            FROM deposit_package_account_routes routes
            INNER JOIN deposit_accounts accounts
              ON accounts.id = routes.depositAccountId
            INNER JOIN deposit_payment_rails rails
              ON rails.id = accounts.paymentRailId
            WHERE accounts.isActive = TRUE
              AND rails.isActive = TRUE
          `);
    const networkByPackageDefinitionId = new Map(
      networkRows.map((row) => [row.packageDefinitionId, row.networkCode]),
    );

    return {
      catalogueAvailable: catalogue.catalogueAvailable,
      items: catalogue.items.map((item) => ({
        displayName: item.displayName,
        slug: item.slug,
        sortOrder: item.sortOrder,
        availability: item.availability,
        price: item.price,
        minimumInvestment: item.minimumInvestment,
        maximumInvestment: item.maximumInvestment,
        rangeConfigured: item.rangeConfigured,
        durationDays: item.durationDays,
        currency: item.currency,
        networkCode:
          networkByPackageDefinitionId.get(item.packageDefinitionId) ?? null,
        dailyRateLabel: dailyRateLabel(item),
      })),
    };
  }
}

@Controller('packages')
export class PackagesController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getEffectiveCatalogue(@CurrentUser() actor: AuthenticatedUser) {
    const catalogue = await this.packagesService.getEffectiveCatalogue();

    if (!catalogue.catalogueAvailable || catalogue.items.length === 0) {
      return catalogue;
    }

    const activePackageRows = await this.prisma.$queryRaw<
      Array<{ packageDefinitionId: string }>
    >(Prisma.sql`
      SELECT DISTINCT ups.packageDefinitionId
      FROM user_package_subscriptions ups
      WHERE ups.userId = ${actor.id}
        AND ups.status = 'ACTIVE'
    `);

    if (activePackageRows.length === 0) {
      return catalogue;
    }

    const activePackageDefinitionIds = new Set<string>(
      activePackageRows.map((row) => row.packageDefinitionId),
    );

    return {
      ...catalogue,
      items: catalogue.items.filter((item) => {
        const packageDefinitionId = packageDefinitionIdFrom(item);
        return (
          packageDefinitionId === null ||
          !activePackageDefinitionIds.has(packageDefinitionId)
        );
      }),
    };
  }
}
