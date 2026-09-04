import { Global, Module } from '@nestjs/common';
import { SecurityConfigModule } from '../security-config/security-config.module';
import { CommunicationAdminController } from './communication-admin.controller';
import { CommunicationService } from './communication.service';
import { EmailTransportService } from './email-transport.service';

@Global()
@Module({
  imports: [SecurityConfigModule],
  controllers: [CommunicationAdminController],
  providers: [CommunicationService, EmailTransportService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
