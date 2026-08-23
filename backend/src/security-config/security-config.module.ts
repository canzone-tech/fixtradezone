import { Module } from '@nestjs/common';
import { SecurityConfigController } from './security-config.controller';
import { SessionPolicyController } from './session-policy.controller';
import { SecurityConfigService } from './security-config.service';
import { SuperAdminOnlyGuard } from './super-admin-only.guard';

@Module({
  controllers: [SecurityConfigController, SessionPolicyController],
  providers: [SecurityConfigService, SuperAdminOnlyGuard],
  exports: [SecurityConfigService, SuperAdminOnlyGuard],
})
export class SecurityConfigModule {}
