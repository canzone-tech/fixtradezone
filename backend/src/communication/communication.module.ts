import { Global, Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { CommunicationAdminController } from './communication-admin.controller';
import { CommunicationService } from './communication.service';
import { EmailTransportService } from './email-transport.service';
import { ManagedEmailTemplateService } from './managed-email-template.service';

@Global()
@Module({
  imports: [SecurityConfigModule, ContentModule],
  controllers: [CommunicationAdminController],
  providers: [
    CommunicationService,
    EmailTransportService,
    ManagedEmailTemplateService,
  ],
  exports: [CommunicationService, ManagedEmailTemplateService],
})
export class CommunicationModule {}
