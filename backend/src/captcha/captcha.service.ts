import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt } from 'node:crypto';

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CaptchaChallengeResponse, CaptchaPurpose } from './captcha.types';

const CAPTCHA_TTL_SECONDS = 180;
const CAPTCHA_MAX_ATTEMPTS = 5;
const CAPTCHA_KEY_PREFIX = 'fixtradezone:captcha:v1';
const CAPTCHA_ERROR = 'Invalid or expired CAPTCHA challenge.';
const CAPTCHA_REDIS_TIMEOUT_MS = 750;
const CAPTCHA_LOCAL_MAX_ENTRIES = 5_000;
const CAPTCHA_REDIS_WARNING_INTERVAL_MS = 30_000;

type SegmentName = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

interface LocalCaptchaState {
  answerDigest: string;
  attemptsRemaining: number;
  expiresAt: number;
  redisBacked: boolean;
}

const DIGIT_SEGMENTS: Readonly<Record<string, readonly SegmentName[]>> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

const SEGMENT_LINES: Readonly<
  Record<SegmentName, readonly [number, number, number, number]>
> = {
  a: [5, 4, 21, 4],
  b: [22, 6, 22, 19],
  c: [22, 23, 22, 36],
  d: [5, 38, 21, 38],
  e: [4, 23, 4, 36],
  f: [4, 6, 4, 19],
  g: [5, 21, 21, 21],
};

const VERIFY_SCRIPT = `
local payload = redis.call('GET', KEYS[1])

if not payload then
  return 0
end

local ok, state = pcall(cjson.decode, payload)

if not ok
  or type(state) ~= 'table'
  or type(state.answerDigest) ~= 'string'
  or type(state.attemptsRemaining) ~= 'number'
then
  redis.call('DEL', KEYS[1])
  return 0
end

if state.answerDigest == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end

state.attemptsRemaining = state.attemptsRemaining - 1

if state.attemptsRemaining <= 0 then
  redis.call('DEL', KEYS[1])
  return 0
end

local ttl = redis.call('PTTL', KEYS[1])

if ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return 0
end

redis.call(
  'SET',
  KEYS[1],
  cjson.encode(state),
  'PX',
  ttl
)

return 0
`;

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly hmacSecret: string;
  private readonly localChallenges = new Map<string, LocalCaptchaState>();
  private lastRedisWarningAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    configService: ConfigService,
  ) {
    this.hmacSecret = configService.getOrThrow<string>('CAPTCHA_HMAC_SECRET');
  }

  async createChallenge(
    purpose: CaptchaPurpose,
  ): Promise<CaptchaChallengeResponse> {
    const enabled = await this.isEnabled(purpose);

    if (!enabled) {
      return {
        enabled: false,
        purpose,
      };
    }

    const challenge = this.generateChallenge();
    this.pruneLocalChallenges();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const challengeId = randomBytes(24).toString('base64url');
      const key = this.buildKey(purpose, challengeId);

      if (this.localChallenges.has(key)) {
        continue;
      }

      const answerDigest = this.digestAnswer(
        purpose,
        challengeId,
        challenge.answer,
      );
      const localState: LocalCaptchaState = {
        answerDigest,
        attemptsRemaining: CAPTCHA_MAX_ATTEMPTS,
        expiresAt: Date.now() + CAPTCHA_TTL_SECONDS * 1_000,
        redisBacked: false,
      };

      this.ensureLocalCapacity();
      this.localChallenges.set(key, localState);

      const redisStored = await this.tryStoreRedisChallenge(key, localState);

      if (redisStored === false) {
        this.localChallenges.delete(key);
        continue;
      }

      localState.redisBacked = redisStored === true;

      return {
        enabled: true,
        purpose,
        challengeId,
        imageDataUri: this.toDataUri(challenge.svg),
        expiresIn: CAPTCHA_TTL_SECONDS,
      };
    }

    throw new Error('Unable to allocate a unique CAPTCHA challenge.');
  }

  async verifyIfEnabled(
    purpose: CaptchaPurpose,
    challengeId?: string,
    answer?: string,
  ): Promise<void> {
    const enabled = await this.isEnabled(purpose);

    if (!enabled) {
      return;
    }

    if (
      typeof challengeId !== 'string' ||
      !/^[A-Za-z0-9_-]{20,128}$/.test(challengeId) ||
      typeof answer !== 'string'
    ) {
      throw new BadRequestException(CAPTCHA_ERROR);
    }

    const normalizedAnswer = answer.trim();

    if (!/^\d{1,3}$/.test(normalizedAnswer)) {
      throw new BadRequestException(CAPTCHA_ERROR);
    }

    const key = this.buildKey(purpose, challengeId);
    const suppliedDigest = this.digestAnswer(
      purpose,
      challengeId,
      normalizedAnswer,
    );

    this.pruneLocalChallenges();
    const localState = this.localChallenges.get(key);

    if (localState) {
      if (localState.redisBacked) {
        const redisResult = await this.tryVerifyRedisChallenge(
          key,
          suppliedDigest,
        );

        if (redisResult !== null) {
          this.reconcileLocalAfterRedisResult(
            key,
            suppliedDigest,
            redisResult,
          );

          if (redisResult) {
            return;
          }

          throw new BadRequestException(CAPTCHA_ERROR);
        }
      }

      if (this.verifyLocalChallenge(key, suppliedDigest)) {
        return;
      }

      throw new BadRequestException(CAPTCHA_ERROR);
    }

    const redisResult = await this.tryVerifyRedisChallenge(key, suppliedDigest);

    if (redisResult === true) {
      return;
    }

    throw new BadRequestException(CAPTCHA_ERROR);
  }

  private async isEnabled(purpose: CaptchaPurpose): Promise<boolean> {
    const config = await this.prisma.systemAuthConfig.findUnique({
      where: {
        id: 1,
      },
      select: {
        captchaOnLoginEnabled: true,
        captchaOnRegistrationEnabled: true,
      },
    });

    if (purpose === CaptchaPurpose.LOGIN) {
      return config?.captchaOnLoginEnabled ?? false;
    }

    return config?.captchaOnRegistrationEnabled ?? false;
  }

  private async tryStoreRedisChallenge(
    key: string,
    state: LocalCaptchaState,
  ): Promise<boolean | null> {
    const storedValue = JSON.stringify({
      answerDigest: state.answerDigest,
      attemptsRemaining: state.attemptsRemaining,
    });

    try {
      const stored = await this.withRedisTimeout(
        this.redis
          .getClient()
          .set(key, storedValue, 'EX', CAPTCHA_TTL_SECONDS, 'NX'),
      );

      return stored === 'OK';
    } catch (error: unknown) {
      this.logRedisFallback(error);
      return null;
    }
  }

  private async tryVerifyRedisChallenge(
    key: string,
    suppliedDigest: string,
  ): Promise<boolean | null> {
    try {
      const rawResult: unknown = await this.withRedisTimeout(
        this.redis.getClient().eval(VERIFY_SCRIPT, 1, key, suppliedDigest),
      );

      return this.readRedisVerificationResult(rawResult);
    } catch (error: unknown) {
      this.logRedisFallback(error);
      return null;
    }
  }

  private readRedisVerificationResult(rawResult: unknown): boolean {
    if (typeof rawResult === 'number') {
      return rawResult === 1;
    }

    return typeof rawResult === 'string' && rawResult === '1';
  }

  private reconcileLocalAfterRedisResult(
    key: string,
    suppliedDigest: string,
    verified: boolean,
  ): void {
    const current = this.localChallenges.get(key);

    if (!current) {
      return;
    }

    if (verified || current.answerDigest === suppliedDigest) {
      this.localChallenges.delete(key);
      return;
    }

    current.attemptsRemaining -= 1;

    if (current.attemptsRemaining <= 0) {
      this.localChallenges.delete(key);
    }
  }

  private verifyLocalChallenge(key: string, suppliedDigest: string): boolean {
    const current = this.localChallenges.get(key);

    if (!current || current.expiresAt <= Date.now()) {
      this.localChallenges.delete(key);
      return false;
    }

    if (current.answerDigest === suppliedDigest) {
      this.localChallenges.delete(key);
      void this.deleteRedisBestEffort(key);
      return true;
    }

    current.attemptsRemaining -= 1;

    if (current.attemptsRemaining <= 0) {
      this.localChallenges.delete(key);
      void this.deleteRedisBestEffort(key);
    }

    return false;
  }

  private async deleteRedisBestEffort(key: string): Promise<void> {
    try {
      await this.withRedisTimeout(this.redis.getClient().del(key));
    } catch {
      // Redis is only the shared-state mirror. The local challenge has already
      // been consumed, and Redis TTL will remove any stale mirror automatically.
    }
  }

  private async withRedisTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('CAPTCHA Redis operation timed out.')),
        CAPTCHA_REDIS_TIMEOUT_MS,
      );
      timer.unref();
    });

    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private logRedisFallback(error: unknown): void {
    const now = Date.now();

    if (now - this.lastRedisWarningAt < CAPTCHA_REDIS_WARNING_INTERVAL_MS) {
      return;
    }

    this.lastRedisWarningAt = now;
    const reason = error instanceof Error ? error.message : 'Unknown Redis error';
    this.logger.warn(
      `CAPTCHA shared Redis state is unavailable; using bounded in-process fallback. ${reason}`,
    );
  }

  private pruneLocalChallenges(): void {
    const now = Date.now();

    for (const [key, state] of this.localChallenges) {
      if (state.expiresAt <= now) {
        this.localChallenges.delete(key);
      }
    }
  }

  private ensureLocalCapacity(): void {
    while (this.localChallenges.size >= CAPTCHA_LOCAL_MAX_ENTRIES) {
      const oldestKey = this.localChallenges.keys().next().value as
        | string
        | undefined;

      if (!oldestKey) {
        return;
      }

      this.localChallenges.delete(oldestKey);
    }
  }

  private buildKey(purpose: CaptchaPurpose, challengeId: string): string {
    return `${CAPTCHA_KEY_PREFIX}:${purpose.toLowerCase()}:${challengeId}`;
  }

  private digestAnswer(
    purpose: CaptchaPurpose,
    challengeId: string,
    answer: string,
  ): string {
    return createHmac('sha256', this.hmacSecret)
      .update(`${purpose}\n${challengeId}\n${answer}`)
      .digest('hex');
  }

  private generateChallenge(): {
    answer: string;
    svg: string;
  } {
    const operator = randomInt(0, 2) === 0 ? '+' : '-';

    let left = randomInt(1, 10);
    let right = randomInt(1, 10);

    if (operator === '-' && right > left) {
      [left, right] = [right, left];
    }

    const answer =
      operator === '+' ? String(left + right) : String(left - right);

    return {
      answer,
      svg: this.renderSvg([String(left), operator, String(right)]),
    };
  }

  private renderSvg(tokens: readonly string[]): string {
    const width = 132;
    const height = 56;

    const symbols = tokens
      .map((token, index) =>
        this.renderSymbol(token, 17 + index * 38, randomInt(-3, 4)),
      )
      .join('');

    const noise = Array.from({ length: 9 }, () => {
      const x1 = randomInt(0, width);
      const y1 = randomInt(0, height);
      const x2 = randomInt(0, width);
      const y2 = randomInt(0, height);

      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8b8b8b" stroke-width="1" opacity="0.35"/>`;
    }).join('');

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '<rect width="100%" height="100%" fill="#f4f1ea"/>',
      noise,
      symbols,
      '</svg>',
    ].join('');
  }

  private renderSymbol(symbol: string, x: number, rotation: number): string {
    const transform = `translate(${x} 7) rotate(${rotation} 13 21)`;

    if (symbol === '+') {
      return [
        `<g transform="${transform}" stroke="#202020" stroke-width="4" stroke-linecap="round">`,
        '<line x1="5" y1="21" x2="21" y2="21"/>',
        '<line x1="13" y1="13" x2="13" y2="29"/>',
        '</g>',
      ].join('');
    }

    if (symbol === '-') {
      return [
        `<g transform="${transform}" stroke="#202020" stroke-width="4" stroke-linecap="round">`,
        '<line x1="5" y1="21" x2="21" y2="21"/>',
        '</g>',
      ].join('');
    }

    const segments = DIGIT_SEGMENTS[symbol];

    if (!segments) {
      throw new Error('Unsupported CAPTCHA symbol.');
    }

    const lines = segments
      .map((segment) => {
        const [x1, y1, x2, y2] = SEGMENT_LINES[segment];

        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
      })
      .join('');

    return [
      `<g transform="${transform}" stroke="#202020" stroke-width="4" stroke-linecap="round">`,
      lines,
      '</g>',
    ].join('');
  }

  private toDataUri(svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  }
}
