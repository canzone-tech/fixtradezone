import { Controller, Get, Header } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PackagesService } from './packages.service';

function packageDefinitionIdFrom(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const packageDefinitionId = candidate['packageDefinitionId'];
  return typeof packageDefinitionId === 'string' ? packageDefinitionId : null;
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
