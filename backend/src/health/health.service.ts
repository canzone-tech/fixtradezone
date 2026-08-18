import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const startedAt = Date.now();

    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: 'ok',
      services: {
        mysql: 'up',
      },
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
    };
  }
}
