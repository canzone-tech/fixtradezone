import { Controller, Get, Header } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { PackagesService } from './packages.service';

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

    const activePackageDefinitionIds = new Set(
      activePackageRows.map((row) => row.packageDefinitionId),
    );

    return {
      ...catalogue,
      items: catalogue.items.filter(
        (item) => !activePackageDefinitionIds.has(item.packageDefinitionId),
      ),
    };
  }
}
