import { ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CaptchaGuard } from './captcha.guard';
import { CaptchaService } from './captcha.service';
import { CaptchaPurpose } from './captcha.types';

describe('CaptchaGuard', () => {
  const reflector = {
    get: jest.fn(),
  };

  const captchaService = {
    verifyIfEnabled: jest.fn(),
  };

  let guard: CaptchaGuard;

  beforeEach(() => {
    jest.clearAllMocks();

    captchaService.verifyIfEnabled.mockResolvedValue(undefined);

    guard = new CaptchaGuard(
      reflector as unknown as Reflector,
      captchaService as unknown as CaptchaService,
    );
  });

  function createContext(body: unknown): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      switchToHttp: () => ({
        getRequest: () => ({
          body,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('forwards login CAPTCHA credentials to the service', async () => {
    reflector.get.mockReturnValue(CaptchaPurpose.LOGIN);

    await expect(
      guard.canActivate(
        createContext({
          identifier: 'trader.one',
          password: 'SecurePassword123!',
          captchaId: 'challenge-id-12345678901234567890',
          captchaAnswer: '12',
        }),
      ),
    ).resolves.toBe(true);

    expect(captchaService.verifyIfEnabled).toHaveBeenCalledWith(
      CaptchaPurpose.LOGIN,
      'challenge-id-12345678901234567890',
      '12',
    );
  });

  it('forwards registration CAPTCHA credentials to the service', async () => {
    reflector.get.mockReturnValue(CaptchaPurpose.REGISTRATION);

    await expect(
      guard.canActivate(
        createContext({
          email: 'user@example.com',
          password: 'SecurePassword123!',
          captchaId: 'challenge-id-12345678901234567890',
          captchaAnswer: '7',
        }),
      ),
    ).resolves.toBe(true);

    expect(captchaService.verifyIfEnabled).toHaveBeenCalledWith(
      CaptchaPurpose.REGISTRATION,
      'challenge-id-12345678901234567890',
      '7',
    );
  });

  it('fails closed when route purpose metadata is missing', async () => {
    reflector.get.mockReturnValue(undefined);

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(captchaService.verifyIfEnabled).not.toHaveBeenCalled();
  });
});
