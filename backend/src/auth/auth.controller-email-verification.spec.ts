import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

describe('AuthController pending email verification login', () => {
  const authService = {
    login: jest.fn(),
  };
  const emailVerificationService = {
    getPendingLinkState: jest.fn(),
  };

  const request = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: jest.fn(() => 'jest-agent'),
  } as unknown as Request;

  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      authService as unknown as AuthService,
      {} as never,
      {} as never,
      emailVerificationService as unknown as EmailVerificationService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('returns remaining link lifetime and suppresses resend while the link is active', async () => {
    authService.login.mockRejectedValue(
      new UnauthorizedException(
        'Email verification pending. Please verify your email before signing in.',
      ),
    );
    emailVerificationService.getPendingLinkState.mockResolvedValue({
      canResend: false,
      expiresIn: 725,
      verificationTtlSeconds: 1800,
    });

    await expect(
      controller.login(
        {
          identifier: 'pending@example.com',
          password: 'CorrectPassword123!',
        },
        request,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_VERIFICATION_PENDING',
        canResend: false,
        verificationLinkExpiresIn: 725,
        verificationLinkTtlSeconds: 1800,
        message:
          'Email verification pending. Check your email and verify your account before the current link expires.',
      },
    });
  });

  it('offers resend only when no active verification link remains', async () => {
    authService.login.mockRejectedValue(
      new UnauthorizedException(
        'Email verification pending. Please verify your email before signing in.',
      ),
    );
    emailVerificationService.getPendingLinkState.mockResolvedValue({
      canResend: true,
      expiresIn: 0,
      verificationTtlSeconds: 1800,
    });

    await expect(
      controller.login(
        {
          identifier: 'pending.user',
          password: 'CorrectPassword123!',
        },
        request,
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_VERIFICATION_PENDING',
        canResend: true,
        verificationLinkExpiresIn: 0,
        verificationLinkTtlSeconds: 1800,
        message:
          'Email verification link has expired. Request a new verification email before signing in.',
      },
    });
  });
});
