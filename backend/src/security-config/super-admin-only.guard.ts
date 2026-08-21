import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class SuperAdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (!user.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }

    return true;
  }
}
