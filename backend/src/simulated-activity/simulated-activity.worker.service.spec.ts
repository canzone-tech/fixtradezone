import type { ConfigService } from '@nestjs/config';
import type { OperationsConfigService } from '../platform-config/operations-config.service';
import type { RedisService } from '../redis/redis.service';
import type { SimulatedActivityService } from './simulated-activity.service';
import { SimulatedActivityWorkerService } from './simulated-activity.worker.service';

describe('SimulatedActivityWorkerService runtime gating', () => {
  const redisService = {
    getClient: jest.fn(),
  };
  const activityService = {
    noteWorkerStart: jest.fn(),
    noteWorkerSuccess: jest.fn(),
    noteWorkerFailure: jest.fn(),
    processDueBatch: jest.fn(),
  };
  const operationsConfigService = {
    getOperations: jest.fn(),
    isAutomatic: jest.fn(),
  };

  function createService(values: Record<string, unknown>) {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    };
    return new SimulatedActivityWorkerService(
      configService as unknown as ConfigService,
      redisService as unknown as RedisService,
      activityService as unknown as SimulatedActivityService,
      operationsConfigService as unknown as OperationsConfigService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    operationsConfigService.getOperations.mockResolvedValue({
      operationsMode: 'AUTOMATIC',
      platformTimezone: 'Asia/Kolkata',
    });
  });

  it('fails closed when SIMULATED_ACTIVITY_WORKER_ENABLED is omitted', async () => {
    const service = createService({ NODE_ENV: 'production' });

    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      infrastructureEnabled: false,
      operationsMode: 'AUTOMATIC',
      automaticProcessingEnabled: false,
    });
  });

  it('requires both worker opt-in and AUTOMATIC operations mode', async () => {
    operationsConfigService.getOperations.mockResolvedValue({
      operationsMode: 'CONTROLLED_MANUAL',
      platformTimezone: 'Asia/Kolkata',
    });
    const service = createService({
      NODE_ENV: 'production',
      SIMULATED_ACTIVITY_WORKER_ENABLED: 'true',
      SIMULATED_ACTIVITY_WORKER_INTERVAL_MS: 60_000,
    });

    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      infrastructureEnabled: true,
      operationsMode: 'CONTROLLED_MANUAL',
      automaticProcessingEnabled: false,
      intervalMs: 60_000,
    });
  });

  it('reports automatic processing only after explicit worker opt-in', async () => {
    const service = createService({
      NODE_ENV: 'production',
      SIMULATED_ACTIVITY_WORKER_ENABLED: true,
      SIMULATED_ACTIVITY_WORKER_INTERVAL_MS: 60_000,
    });

    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      infrastructureEnabled: true,
      operationsMode: 'AUTOMATIC',
      automaticProcessingEnabled: true,
      platformTimezone: 'Asia/Kolkata',
    });
  });
});
