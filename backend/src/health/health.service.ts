import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CommunicationService } from '../communication/communication.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly communicationService: CommunicationService,
  ) {}

  async check() {
    const startedAt = Date.now();
    const [mysqlResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redisService.ping(),
    ]);
    const email = this.communicationService.getEmailConfigurationStatus();

    const mysqlUp = mysqlResult.status === 'fulfilled';
    const redisUp =
      redisResult.status === 'fulfilled' && redisResult.value === true;

    const payload = {
      status: mysqlUp && redisUp ? 'ok' : 'degraded',
      services: {
        mysql: mysqlUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
        email: {
          mode: email.mode,
          configured: email.configured,
        },
      },
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
    };

    if (!mysqlUp || !redisUp) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}
