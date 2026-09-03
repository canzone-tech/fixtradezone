import { Injectable } from '@nestjs/common';
import { EmailTransportService } from './email-transport.service';
import type { EmailDeliveryResult, EmailMessage } from './communication.types';

@Injectable()
export class CommunicationService {
  constructor(private readonly emailTransport: EmailTransportService) {}

  sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    return this.emailTransport.send(message);
  }
}
