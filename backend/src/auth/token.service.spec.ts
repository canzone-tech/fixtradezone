import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
        JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
      };

      return values[key];
    }),
  };

  let service: TokenService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TokenService(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('issues access and refresh tokens with separate types and secrets', async () => {
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    const result = await service.issueTokenPair(
      { id: 'user-id' },
      'session-id',
    );

    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      {
        sub: 'user-id',
        type: 'access',
        sid: 'session-id',
      },
      {
        secret: 'access-secret-with-at-least-32-characters',
        algorithm: 'HS256',
        audience: 'fixtradezone-clients',
        expiresIn: 900,
        issuer: 'fixtradezone-api',
      },
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      {
        sub: 'user-id',
        type: 'refresh',
        jti: 'session-id',
      },
      {
        secret: 'refresh-secret-with-at-least-32-characters',
        algorithm: 'HS256',
        audience: 'fixtradezone-sessions',
        expiresIn: 604800,
        issuer: 'fixtradezone-api',
      },
    );
    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      sessionId: 'session-id',
    });
    expect(result.refreshTokenHash).toHaveLength(64);
  });

  it('accepts only signed refresh-token payloads', async () => {
    const payload = {
      sub: 'user-id',
      type: 'refresh' as const,
      jti: 'session-id',
    };
    jwtService.verifyAsync.mockResolvedValue(payload);

    await expect(service.verifyRefreshToken('token')).resolves.toEqual(payload);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('token', {
      secret: 'refresh-secret-with-at-least-32-characters',
      algorithms: ['HS256'],
      audience: 'fixtradezone-sessions',
      issuer: 'fixtradezone-api',
    });
  });

  it('returns a generic error for invalid refresh tokens', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('signature details'));

    await expect(service.verifyRefreshToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.verifyRefreshToken('token')).rejects.toMatchObject({
      response: {
        message: 'Invalid or expired session.',
      },
    });
  });
});
