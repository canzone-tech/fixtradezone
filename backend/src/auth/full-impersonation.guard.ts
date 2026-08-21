import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SecurityConfigService } from '../security-config/security-config.service';
import type { ImpersonationPrincipal } from './impersonation.types';

interface ImpersonationRequest {
  user?: ImpersonationPrincipal;
}

@Injectable()
export class FullImpersonationGuard implements CanActivate {
  constructor(private readonly securityConfigService: SecurityConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ImpersonationRequest>();

    if (!request.user?.impersonation?.id) {
      throw new UnauthorizedException(
        'A valid impersonation session is required.',
      );
    }

    const config = await this.securityConfigService.get();

    if (!config.fullUserImpersonationEnabled) {
      throw new ForbiddenException('Full user impersonation is disabled.');
    }

    return true;
  }
}
