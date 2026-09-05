import { ServiceUnavailableException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RedisService } from '../redis/redis.service';
import { PublicAuthRateLimitGuard } from './public-auth-rate-limit.guard';

type RateLimitMetadata = {
  name: string;
  limit: number;
  windowSeconds: number;
  identityField?: string;
  identityLimit?: number;
};

type StatusError = {
  getStatus(): number;
};

function asDependency<T>(value: unknown): T {
  return value as T;
}

function hasStatus(error: unknown): error is StatusError {
  if (typeof error !== 'object' || error === null || !('getStatus' in error)) {
    return false;
  }

  const candidate = error as { getStatus?: unknown };
  return typeof candidate.getStatus === 'function';
}

describe('PublicAuthRateLimitGuard', () => {
  const getAllAndOverride = jest.fn<
    (
      metadataKey: unknown,
      targets: unknown[],
    ) => RateLimitMetadata | undefined
  >();
  const incr = jest.fn<(key: string) => Promise<number>>();
  const expire = jest.fn<(key: string, seconds: number) => Promise<number>>();
  const ttl = jest.fn<(key: string) => Promise<number>>();

  const reflector = asDependency<Reflector>({
    getAllAndOverride,
  });

  const redisService = asDependency<RedisService>({
    getClient: () => ({ incr, expire, ttl }),
  });

  const guard = new PublicAuthRateLimitGuard(reflector, redisService);

  function context(body: Record<string, unknown> = {}): ExecutionContext {
    return asDependency<ExecutionContext>({
      getHandler: () => function handler() {},
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '203.0.113.10',
          socket: { remoteAddress: '127.0.0.1' },
          body,
        }),
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    incr.mockResolvedValue(1);
    expire.mockResolvedValue(1);
    ttl.mockResolvedValue(60);
  });

  it('allows routes without rate limit metadata', async () => {
    getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(incr).not.toHaveBeenCalled();
  });

  it('enforces both IP and normalized identity buckets', async () => {
    getAllAndOverride.mockReturnValue({
      name: 'login',
      limit: 120,
      windowSeconds: 900,
      identityField: 'identifier',
      identityLimit: 12,
    });

    await expect(
      guard.canActivate(context({ identifier: ' USER@Example.COM ' })),
    ).resolves.toBe(true);

    expect(incr).toHaveBeenCalledTimes(2);
    const keys = incr.mock.calls.map(([key]) => key);
    expect(keys[0]).toMatch(/^ftz:auth:rate-limit:login:ip:[a-f0-9]{32}$/);
    expect(keys[1]).toMatch(
      /^ftz:auth:rate-limit:login:identity:[a-f0-9]{32}$/,
    );
    expect(expire).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenNthCalledWith(1, keys[0], 900);
    expect(expire).toHaveBeenNthCalledWith(2, keys[1], 900);
  });

  it('returns 429 after the configured limit is exceeded', async () => {
    getAllAndOverride.mockReturnValue({
      name: 'login',
      limit: 2,
      windowSeconds: 60,
    });
    incr.mockResolvedValue(3);
    ttl.mockResolvedValue(41);

    try {
      await guard.canActivate(context());
      throw new Error('Expected the rate limit guard to reject the request.');
    } catch (error: unknown) {
      if (!hasStatus(error)) throw error;
      expect(error.getStatus()).toBe(429);
    }

    expect(ttl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Redis protection is unavailable', async () => {
    getAllAndOverride.mockReturnValue({
      name: 'register',
      limit: 10,
      windowSeconds: 60,
    });
    incr.mockRejectedValue(new Error('Redis unavailable'));

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
