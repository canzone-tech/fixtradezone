import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { SecurityConfigService } from '../security-config/security-config.service';
import { ALLOW_USER_IMPERSONATION_KEY } from './allow-user-impersonation.decorator';
import type { AuthenticatedUser } from './auth-user';
import type { ImpersonationPrincipal } from './impersonation.types';
import { IS_PUBLIC_KEY } from './public.decorator';

type AuthPrincipal = AuthenticatedUser | ImpersonationPrincipal;

interface AuthenticatedRequest {
  user?: AuthPrincipal;
}

function isImpersonationPrincipal(
  value: AuthPrincipal | undefined,
): value is ImpersonationPrincipal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'user' in value &&
    'impersonation' in value,
  );
}

@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'impersonation']) {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityConfigService: SecurityConfigService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const result = await super.canActivate(context);

    if (!result) {
      return false;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!isImpersonationPrincipal(request.user)) {
      return true;
    }

    const allowImpersonation = this.reflector.getAllAndOverride<boolean>(
      ALLOW_USER_IMPERSONATION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowImpersonation) {
      throw new UnauthorizedException(
        'Impersonation is not allowed for this endpoint.',
      );
    }

    const securityConfig = await this.securityConfigService.get();

    if (!securityConfig.fullUserImpersonationEnabled) {
      throw new ForbiddenException('Full user impersonation is disabled.');
    }

    // USER-facing controllers must always resolve against the
    // impersonated subject identity, never the administrator.
    request.user = request.user.user;

    return true;
  }
}
