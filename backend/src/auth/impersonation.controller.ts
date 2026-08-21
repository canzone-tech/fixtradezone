import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { SecurityConfigService } from '../security-config/security-config.service';
import { ImpersonationAuthGuard } from './impersonation-auth.guard';
import type {
  ImpersonationPrincipal,
  ImpersonationSessionView,
} from './impersonation.types';
import { Public } from './public.decorator';

@Controller('user/impersonation')
export class ImpersonationController {
  constructor(private readonly securityConfigService: SecurityConfigService) {}

  @Get('session')
  @Public()
  @UseGuards(ImpersonationAuthGuard)
  @Header('Cache-Control', 'no-store')
  async getSession(
    @Req()
    request: {
      user: ImpersonationPrincipal;
    },
  ): Promise<ImpersonationSessionView> {
    const config = await this.securityConfigService.get();

    return {
      user: request.user.user,
      impersonation: {
        ...request.user.impersonation,
        accessMode: config.fullUserImpersonationEnabled ? 'FULL' : 'LIMITED',
      },
      sessionPolicy: {
        idleLockMinutes: config.idleLockMinutes,
      },
    };
  }
}
