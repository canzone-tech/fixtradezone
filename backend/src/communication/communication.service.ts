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
