import { Global, Module } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { EmailTransportService } from './email-transport.service';

@Global()
@Module({
  providers: [CommunicationService, EmailTransportService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
