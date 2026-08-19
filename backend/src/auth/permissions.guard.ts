import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from './auth-user';
import {
  ADMIN_ROLE_NAME,
  SUPER_ADMIN_ROLE_NAME,
} from './auth.constants';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(
        REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (user.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      return true;
    }

    if (!user.roles.includes(ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('Administrator access is required.');
    }

    const grantedPermissions = new Set(user.permissions);

    if (
      !requiredPermissions.every((permission) =>
        grantedPermissions.has(permission),
      )
    ) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
