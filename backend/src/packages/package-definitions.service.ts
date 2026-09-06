import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PackageDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  ensure(code: string) {
    return this.prisma.packageDefinition.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }
}
