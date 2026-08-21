import { Controller, Get, Header } from '@nestjs/common';
import { SecurityConfigService } from './security-config.service';

@Controller('auth/session-policy')
export class SessionPolicyController {
  constructor(private readonly securityConfigService: SecurityConfigService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  async getPolicy() {
    const config = await this.securityConfigService.get();

    return {
      idleLockMinutes: config.idleLockMinutes,
    };
  }
}
