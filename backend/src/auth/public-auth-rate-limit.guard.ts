import { createHash } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import {
  PUBLIC_AUTH_RATE_LIMIT_KEY,
  type PublicAuthRateLimitOptions,
} from './public-auth-rate-limit.decorator';

const KEY_PREFIX = 'ftz:auth:rate-limit';

@Injectable()
export class PublicAuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<PublicAuthRateLimitOptions>(
      PUBLIC_AUTH_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip || request.socket.remoteAddress || 'unknown';

    try {
      await this.enforce(
        `${KEY_PREFIX}:${options.name}:ip:${this.hash(ip)}`,
        options.limit,
        options.windowSeconds,
      );

      if (options.identityField && options.identityLimit) {
        const body = request.body as Record<string, unknown> | undefined;
        const rawIdentity = body?.[options.identityField];

        if (typeof rawIdentity === 'string' && rawIdentity.trim()) {
          await this.enforce(
            `${KEY_PREFIX}:${options.name}:identity:${this.hash(
              rawIdentity.trim().toLowerCase(),
            )}`,
            options.identityLimit,
            options.windowSeconds,
          );
        }
      }
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        'Authentication protection is temporarily unavailable.',
      );
    }

    return true;
  }

  private async enforce(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const redis = this.redisService.getClient();
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (count > limit) {
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many authentication requests. Try again later.',
          retryAfterSeconds: retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 32);
  }
}
