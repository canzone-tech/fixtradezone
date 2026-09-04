import { Injectable } from '@nestjs/common';
import { EmailTransportService } from './email-transport.service';
import type { EmailDeliveryResult, EmailMessage } from './communication.types';

@Injectable()
export class CommunicationService {
  constructor(private readonly emailTransport: EmailTransportService) {}

  sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    return this.emailTransport.send(message);
  }

  getEmailConfigurationStatus(): {
    mode: 'CONSOLE' | 'HTTP' | 'SMTP';
    configured: boolean;
  } {
    const status = this.emailTransport.getConfigurationStatus();
    return {
      mode: status.mode,
      configured: status.configured,
    };
  }
}
