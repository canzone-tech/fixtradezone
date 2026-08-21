import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { SecurityConfigService } from '../security-config/security-config.service';
import { FullImpersonationGuard } from './full-impersonation.guard';
import type { ImpersonationPrincipal } from './impersonation.types';

const principal = {
  user: {},
  impersonation: {
    id: 'impersonation-id',
  },
} as unknown as ImpersonationPrincipal;

function contextFor(user?: ImpersonationPrincipal): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('FullImpersonationGuard', () => {
  const getConfig = jest.fn();

  const securityConfigService = {
    get: getConfig,
  } as unknown as SecurityConfigService;

  let guard: FullImpersonationGuard;

  beforeEach(() => {
    jest.clearAllMocks();

    guard = new FullImpersonationGuard(securityConfigService);
  });

  it('allows FULL impersonation when enabled', async () => {
    getConfig.mockResolvedValueOnce({
      fullUserImpersonationEnabled: true,
      idleLockMinutes: 5,
      updatedAt: null,
    });

    await expect(guard.canActivate(contextFor(principal))).resolves.toBe(true);
  });

  it('rejects full access when configuration is LIMITED', async () => {
    getConfig.mockResolvedValueOnce({
      fullUserImpersonationEnabled: false,
      idleLockMinutes: 5,
      updatedAt: null,
    });

    await expect(
      guard.canActivate(contextFor(principal)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a request without impersonation identity', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(getConfig).not.toHaveBeenCalled();
  });
});
