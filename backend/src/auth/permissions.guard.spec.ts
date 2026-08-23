import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function contextFor(user: {
  roles: string[];
  permissions: string[];
}): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows SUPER_ADMIN regardless of stored permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['rbac.manage']);

    expect(
      guard.canActivate(
        contextFor({
          roles: ['SUPER_ADMIN', 'USER'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows ADMIN when every required permission is granted', () => {
    reflector.getAllAndOverride.mockReturnValue(['rbac.read', 'users.read']);

    expect(
      guard.canActivate(
        contextFor({
          roles: ['ADMIN', 'USER'],
          permissions: ['rbac.read', 'users.read'],
        }),
      ),
    ).toBe(true);
  });

  it('denies ADMIN without the required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['rbac.manage']);

    expect(() =>
      guard.canActivate(
        contextFor({
          roles: ['ADMIN', 'USER'],
          permissions: ['rbac.read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies a normal USER from admin permission routes', () => {
    reflector.getAllAndOverride.mockReturnValue(['users.read']);

    expect(() =>
      guard.canActivate(
        contextFor({
          roles: ['USER'],
          permissions: ['users.read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
