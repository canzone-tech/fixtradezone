import {
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { RedisService } from '../redis/redis.service';
import { PublicAuthRateLimitGuard } from './public-auth-rate-limit.guard';

describe('PublicAuthRateLimitGuard', () => {
  const getAllAndOverride = jest.fn();
  const incr = jest.fn();
  const expire = jest.fn();
  const ttl = jest.fn();

  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;

  const redisService = {
    getClient: () => ({ incr, expire, ttl }),
  } as unknown as RedisService;

  const guard = new PublicAuthRateLimitGuard(reflector, redisService);

  function context(body: Record<string, unknown> = {}): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '203.0.113.10',
          socket: { remoteAddress: '127.0.0.1' },
          body,
        }),
      }),
    } as unknown as ExecutionContext;
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
    const keys = incr.mock.calls.map(([key]) => String(key));
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

    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: 429,
    } satisfies Partial<HttpException>);

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
