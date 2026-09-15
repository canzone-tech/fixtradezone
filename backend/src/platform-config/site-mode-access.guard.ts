import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth/auth-user';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { SiteModeService } from './site-mode.service';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class SiteModeAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly siteModeService: SiteModeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) return true;

    await this.siteModeService.assertAuthenticatedAccess(request.user);
    return true;
  }
}
