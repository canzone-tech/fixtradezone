import { ConfigService } from '@nestjs/config';
import { OperationsConfigService } from '../platform-config/operations-config.service';
import { RedisService } from '../redis/redis.service';
import { AwardRewardWorkerService } from './award-reward-worker.service';
import { AwardRewardsService } from './award-rewards.service';

describe('AwardRewardWorkerService', () => {
  const redisClient = {
    set: jest.fn(),
    eval: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const redisService = {
    getClient: jest.fn(() => redisClient),
  };
  const awardRewardsService = {
    reconcile: jest.fn(),
  };
  const operationsConfigService = {
    getOperations: jest.fn(),
    isAutomatic: jest.fn(),
  };

  function createService() {
    return new AwardRewardWorkerService(
      configService as unknown as ConfigService,
      redisService as unknown as RedisService,
      awardRewardsService as unknown as AwardRewardsService,
      operationsConfigService as unknown as OperationsConfigService,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });
    operationsConfigService.getOperations.mockResolvedValue({
      operationsMode: 'AUTOMATIC',
      platformTimezone: 'Asia/Kolkata',
      updatedAt: null,
    });
    operationsConfigService.isAutomatic.mockResolvedValue(true);
    redisClient.set.mockResolvedValue('OK');
    redisClient.eval.mockResolvedValue(1);
    awardRewardsService.reconcile.mockResolvedValue({
      usersProcessed: 0,
      startedTracks: 0,
      awardsPosted: 0,
      closedTracks: 0,
      results: [],
    });
  });

  it('enables automatic processing by default when Operations mode is AUTOMATIC', async () => {
    const service = createService();

    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      infrastructureEnabled: true,
      operationsMode: 'AUTOMATIC',
      automaticProcessingEnabled: true,
    });
  });

  it('allows an explicit environment kill switch', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'development';
      if (key === 'AWARD_REWARD_WORKER_ENABLED') return 'false';
      return undefined;
    });
    const service = createService();

    await expect(service.getRuntimeStatus()).resolves.toMatchObject({
      infrastructureEnabled: false,
      automaticProcessingEnabled: false,
    });
  });

  it('runs an automatic reconciliation immediately on startup', async () => {
    const service = createService();

    service.onModuleInit();
    await new Promise<void>((resolve) => setImmediate(resolve));
    service.onApplicationShutdown();

    expect(awardRewardsService.reconcile).toHaveBeenCalledWith(
      undefined,
      null,
      {},
      true,
    );
  });
});
