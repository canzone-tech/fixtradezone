import {
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
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

function asDependency<T>(value: unknown): T {
  return value as T;
}

describe('PublicAuthRateLimitGuard', () => {
  let metadata: RateLimitMetadata | undefined;
  let incrResult: number;
  let ttlResult: number;
  let incrError: Error | null;
  const incrKeys: string[] = [];
  const expireCalls: Array<{ key: string; seconds: number }> = [];
  const ttlKeys: string[] = [];

  const reflector = asDependency<Reflector>({
    getAllAndOverride(metadataKey: unknown, targets: unknown[]) {
      void metadataKey;
      void targets;
      return metadata;
    },
  });

  const redisService = asDependency<RedisService>({
    getClient: () => ({
      incr(key: string): Promise<number> {
        incrKeys.push(key);
        if (incrError) return Promise.reject(incrError);
        return Promise.resolve(incrResult);
      },
      expire(key: string, seconds: number): Promise<number> {
        expireCalls.push({ key, seconds });
        return Promise.resolve(1);
      },
      ttl(key: string): Promise<number> {
        ttlKeys.push(key);
        return Promise.resolve(ttlResult);
      },
    }),
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
    metadata = undefined;
    incrResult = 1;
    ttlResult = 60;
    incrError = null;
    incrKeys.length = 0;
    expireCalls.length = 0;
    ttlKeys.length = 0;
  });

  it('allows routes without rate limit metadata', async () => {
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(incrKeys).toHaveLength(0);
  });

  it('enforces both IP and normalized identity buckets', async () => {
    metadata = {
      name: 'login',
      limit: 120,
      windowSeconds: 900,
      identityField: 'identifier',
      identityLimit: 12,
    };

    await expect(
      guard.canActivate(context({ identifier: ' USER@Example.COM ' })),
    ).resolves.toBe(true);

    expect(incrKeys).toHaveLength(2);
    const ipKey = incrKeys[0];
    const identityKey = incrKeys[1];
    if (!ipKey || !identityKey) {
      throw new Error('Expected IP and identity rate-limit keys.');
    }

    expect(ipKey).toMatch(/^ftz:auth:rate-limit:login:ip:[a-f0-9]{32}$/);
    expect(identityKey).toMatch(
      /^ftz:auth:rate-limit:login:identity:[a-f0-9]{32}$/,
    );
    expect(expireCalls).toEqual([
      { key: ipKey, seconds: 900 },
      { key: identityKey, seconds: 900 },
    ]);
  });

  it('returns 429 after the configured limit is exceeded', async () => {
    metadata = {
      name: 'login',
      limit: 2,
      windowSeconds: 60,
    };
    incrResult = 3;
    ttlResult = 41;

    try {
      await guard.canActivate(context());
      throw new Error('Expected the rate limit guard to reject the request.');
    } catch (error: unknown) {
      if (!(error instanceof HttpException)) throw error;
      expect(error.getStatus()).toBe(429);
    }

    expect(ttlKeys).toHaveLength(1);
  });

  it('fails closed when Redis protection is unavailable', async () => {
    metadata = {
      name: 'register',
      limit: 10,
      windowSeconds: 60,
    };
    incrError = new Error('Redis unavailable');

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
