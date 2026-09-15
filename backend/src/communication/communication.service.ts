import { Injectable } from '@nestjs/common';
import type { EmailTemplateContent } from '../content/content.defaults';
import { EmailTransportService } from './email-transport.service';
import type { EmailDeliveryResult, EmailMessage } from './communication.types';
import { ManagedEmailTemplateService } from './managed-email-template.service';

@Injectable()
export class CommunicationService {
  constructor(
    private readonly emailTransport: EmailTransportService,
    private readonly managedTemplates: ManagedEmailTemplateService,
  ) {}

  async sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
    const effectiveMessage = await this.managedTemplates.apply(message);
    return this.emailTransport.send(effectiveMessage);
  }

  async sendControlledTemplateTest(input: {
    contentKey: string;
    content: EmailTemplateContent;
    to: string;
    actorUsername: string;
  }): Promise<EmailDeliveryResult> {
    const message = this.managedTemplates.renderControlledTest(
      input.contentKey,
      input.content,
      input.to,
      input.actorUsername,
    );
    return this.emailTransport.send(message);
  }

  getEmailConfigurationStatus() {
    // EmailTransportService intentionally returns only non-secret transport
    // metadata. Credentials remain server-side while SUPER_ADMIN can verify
    // sender, endpoint and TLS readiness from the Email Delivery screen.
    return this.emailTransport.getConfigurationStatus();
  }
}
