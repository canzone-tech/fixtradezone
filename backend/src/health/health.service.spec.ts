import { ServiceUnavailableException } from '@nestjs/common';
import type { CommunicationService } from '../communication/communication.service';
import type { PrismaService } from '../database/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const ping = jest.fn();
  const getEmailConfigurationStatus = jest.fn();

  const prisma = {
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  const redisService = {
    ping,
  } as unknown as RedisService;

  const communicationService = {
    getEmailConfigurationStatus,
  } as unknown as CommunicationService;

  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([{ ok: 1 }]);
    ping.mockResolvedValue(true);
    getEmailConfigurationStatus.mockReturnValue({
      mode: 'SMTP',
      configured: true,
    });
    service = new HealthService(prisma, redisService, communicationService);
  });

  it('reports healthy only when MySQL and Redis are available', async () => {
    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      services: {
        mysql: 'up',
        redis: 'up',
        email: {
          mode: 'SMTP',
          configured: true,
        },
      },
    });
  });

  it('fails readiness when MySQL is unavailable', async () => {
    queryRaw.mockRejectedValue(new Error('mysql down'));

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails readiness when Redis is unavailable', async () => {
    ping.mockRejectedValue(new Error('redis down'));

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
