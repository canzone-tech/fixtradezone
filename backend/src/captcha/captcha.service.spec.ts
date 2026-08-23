import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CaptchaService } from './captcha.service';
import { CaptchaPurpose } from './captcha.types';

const HMAC_SECRET = 'test-captcha-hmac-secret-0123456789abcdef';

describe('CaptchaService', () => {
  const store = new Map<string, string>();

  const redisClient = {
    set: jest.fn((key: string, value: string): 'OK' | null => {
      if (store.has(key)) {
        return null;
      }

      store.set(key, value);
      return 'OK';
    }),

    eval: jest.fn(
      (
        _script: string,
        _numberOfKeys: number,
        key: string,
        suppliedDigest: string,
      ): number => {
        const payload = store.get(key);

        if (!payload) {
          return 0;
        }

        const digestMatch = /"answerDigest":"([a-f0-9]{64})"/.exec(payload);

        const attemptsMatch = /"attemptsRemaining":(\d+)/.exec(payload);

        const answerDigest = digestMatch?.[1];
        const attemptsRemaining = attemptsMatch?.[1]
          ? Number(attemptsMatch[1])
          : 0;

        if (!answerDigest || attemptsRemaining <= 0) {
          store.delete(key);
          return 0;
        }

        if (answerDigest === suppliedDigest) {
          store.delete(key);
          return 1;
        }

        const nextAttempts = attemptsRemaining - 1;

        if (nextAttempts <= 0) {
          store.delete(key);
          return 0;
        }

        store.set(
          key,
          JSON.stringify({
            answerDigest,
            attemptsRemaining: nextAttempts,
          }),
        );

        return 0;
      },
    ),
  };

  const redisService = {
    getClient: () => redisClient,
  };

  const prisma = {
    systemAuthConfig: {
      findUnique: jest.fn(),
    },
  };

  const configService = {
    getOrThrow: jest.fn((key: string): string => {
      if (key === 'CAPTCHA_HMAC_SECRET') {
        return HMAC_SECRET;
      }

      throw new Error(`Unexpected config key: ${key}`);
    }),
  };

  let service: CaptchaService;

  beforeEach(() => {
    jest.clearAllMocks();
    store.clear();

    prisma.systemAuthConfig.findUnique.mockResolvedValue({
      captchaOnLoginEnabled: true,
      captchaOnRegistrationEnabled: true,
    });

    service = new CaptchaService(
      prisma as unknown as PrismaService,
      redisService as unknown as RedisService,
      configService as unknown as ConfigService,
    );
  });

  function getStoredChallenge(): {
    key: string;
    digest: string;
    attemptsRemaining: number;
  } {
    const entry = [...store.entries()][0];

    if (!entry) {
      throw new Error('Expected a stored CAPTCHA challenge.');
    }

    const [key, payload] = entry;

    const digestMatch = /"answerDigest":"([a-f0-9]{64})"/.exec(payload);

    const attemptsMatch = /"attemptsRemaining":(\d+)/.exec(payload);

    if (!digestMatch?.[1] || !attemptsMatch?.[1]) {
      throw new Error('Stored CAPTCHA state is malformed.');
    }

    return {
      key,
      digest: digestMatch[1],
      attemptsRemaining: Number(attemptsMatch[1]),
    };
  }

  function solveAnswer(
    purpose: CaptchaPurpose,
    challengeId: string,
    digest: string,
  ): string {
    for (let answer = 0; answer <= 18; answer += 1) {
      const candidate = String(answer);

      const candidateDigest = createHmac('sha256', HMAC_SECRET)
        .update(`${purpose}\n${challengeId}\n${candidate}`)
        .digest('hex');

      if (candidateDigest === digest) {
        return candidate;
      }
    }

    throw new Error('Unable to solve generated CAPTCHA fixture.');
  }

  it('returns disabled without allocating Redis state', async () => {
    prisma.systemAuthConfig.findUnique.mockResolvedValue({
      captchaOnLoginEnabled: false,
      captchaOnRegistrationEnabled: false,
    });

    await expect(
      service.createChallenge(CaptchaPurpose.LOGIN),
    ).resolves.toEqual({
      enabled: false,
      purpose: CaptchaPurpose.LOGIN,
    });

    await expect(
      service.verifyIfEnabled(CaptchaPurpose.LOGIN, undefined, undefined),
    ).resolves.toBeUndefined();

    expect(redisClient.set).not.toHaveBeenCalled();
    expect(redisClient.eval).not.toHaveBeenCalled();
  });

  it('stores only an HMAC digest and verifies a correct answer once', async () => {
    const challenge = await service.createChallenge(CaptchaPurpose.LOGIN);

    expect(challenge.enabled).toBe(true);

    if (!challenge.enabled) {
      throw new Error('Expected CAPTCHA to be enabled.');
    }

    expect(challenge.expiresIn).toBe(180);
    expect(
      challenge.imageDataUri.startsWith('data:image/svg+xml;base64,'),
    ).toBe(true);

    const stored = getStoredChallenge();
    const payload = store.get(stored.key);

    expect(payload).toBeDefined();
    expect(payload).not.toContain('"answer":');
    expect(stored.attemptsRemaining).toBe(5);

    const answer = solveAnswer(
      CaptchaPurpose.LOGIN,
      challenge.challengeId,
      stored.digest,
    );

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.LOGIN,
        challenge.challengeId,
        answer,
      ),
    ).resolves.toBeUndefined();

    expect(store.size).toBe(0);

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.LOGIN,
        challenge.challengeId,
        answer,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decrements failed attempts and destroys the fifth failed challenge', async () => {
    const challenge = await service.createChallenge(CaptchaPurpose.LOGIN);

    if (!challenge.enabled) {
      throw new Error('Expected CAPTCHA to be enabled.');
    }

    const stored = getStoredChallenge();

    const answer = solveAnswer(
      CaptchaPurpose.LOGIN,
      challenge.challengeId,
      stored.digest,
    );

    const wrongAnswer = answer === '0' ? '1' : '0';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        service.verifyIfEnabled(
          CaptchaPurpose.LOGIN,
          challenge.challengeId,
          wrongAnswer,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    expect(getStoredChallenge().attemptsRemaining).toBe(1);

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.LOGIN,
        challenge.challengeId,
        wrongAnswer,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(store.size).toBe(0);

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.LOGIN,
        challenge.challengeId,
        answer,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired challenge', async () => {
    const challenge = await service.createChallenge(
      CaptchaPurpose.REGISTRATION,
    );

    if (!challenge.enabled) {
      throw new Error('Expected CAPTCHA to be enabled.');
    }

    const stored = getStoredChallenge();

    const answer = solveAnswer(
      CaptchaPurpose.REGISTRATION,
      challenge.challengeId,
      stored.digest,
    );

    store.delete(stored.key);

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.REGISTRATION,
        challenge.challengeId,
        answer,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('binds every challenge to its declared purpose', async () => {
    const challenge = await service.createChallenge(CaptchaPurpose.LOGIN);

    if (!challenge.enabled) {
      throw new Error('Expected CAPTCHA to be enabled.');
    }

    const stored = getStoredChallenge();

    const answer = solveAnswer(
      CaptchaPurpose.LOGIN,
      challenge.challengeId,
      stored.digest,
    );

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.REGISTRATION,
        challenge.challengeId,
        answer,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.verifyIfEnabled(
        CaptchaPurpose.LOGIN,
        challenge.challengeId,
        answer,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects missing or malformed challenge credentials when enabled', async () => {
    await expect(
      service.verifyIfEnabled(CaptchaPurpose.LOGIN, undefined, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.verifyIfEnabled(CaptchaPurpose.LOGIN, 'invalid id', 'abc'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
