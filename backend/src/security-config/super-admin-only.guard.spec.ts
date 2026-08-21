import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { SuperAdminOnlyGuard } from './super-admin-only.guard';

function contextFor(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user,
      }),
    }),
  } as unknown as ExecutionContext;
}

const baseUser: AuthenticatedUser = {
  id: 'user-id',
  email: 'user@example.com',
  username: 'user',
  phone: null,
  firstName: 'Test',
  lastName: 'User',
  status: 'ACTIVE',
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: ['USER'],
  permissions: [],
};

describe('SuperAdminOnlyGuard', () => {
  const guard = new SuperAdminOnlyGuard();

  it('allows SUPER_ADMIN', () => {
    expect(
      guard.canActivate(
        contextFor({
          ...baseUser,
          roles: ['SUPER_ADMIN', 'USER'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects ADMIN', () => {
    expect(() =>
      guard.canActivate(
        contextFor({
          ...baseUser,
          roles: ['ADMIN', 'USER'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects unauthenticated requests', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(
      UnauthorizedException,
    );
  });
});
