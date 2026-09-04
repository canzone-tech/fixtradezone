import { SetMetadata } from '@nestjs/common';

export const PUBLIC_AUTH_RATE_LIMIT_KEY = 'publicAuthRateLimit';

export interface PublicAuthRateLimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
  identityField?: string;
  identityLimit?: number;
}

export const PublicAuthRateLimit = (options: PublicAuthRateLimitOptions) =>
  SetMetadata(PUBLIC_AUTH_RATE_LIMIT_KEY, options);
