import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth/auth-user';
import { MANUAL_OPERATION_KEY } from './manual-operation.decorator';
import { SiteModeService } from './site-mode.service';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class ManualOperationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly siteModeService: SiteModeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isManualOperation = this.reflector.getAllAndOverride<boolean>(
      MANUAL_OPERATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!isManualOperation) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) return true;

    await this.siteModeService.assertManualOperationAllowed(request.user);
    return true;
  }
}
