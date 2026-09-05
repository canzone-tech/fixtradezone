import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONTENT_KEYS,
  type EmailContentKey,
  type EmailTemplateContent,
} from '../content/content.defaults';
import { ContentService } from '../content/content.service';
import type { EmailMessage } from './communication.types';
import { renderManagedEmailTemplate } from './email-template.renderer';

interface VerificationInput {
  to: string;
  displayName: string;
  actionUrl: string;
  ttlMinutes: number;
}

interface DeliveryTestInput {
  to: string;
  actorUsername: string;
  triggeredAt: Date;
}

@Injectable()
export class ManagedEmailTemplateService {
  constructor(
    private readonly contentService: ContentService,
    private readonly configService: ConfigService,
  ) {}

  async renderVerification(input: VerificationInput): Promise<EmailMessage> {
    return this.renderActionTemplate(CONTENT_KEYS.EMAIL_VERIFICATION, input, {
      displayName: input.displayName,
      verificationUrl: input.actionUrl,
      expiresInMinutes: String(Math.max(1, Math.trunc(input.ttlMinutes))),
    });
  }

  async renderPasswordReset(input: VerificationInput): Promise<EmailMessage> {
    return this.renderActionTemplate(CONTENT_KEYS.PASSWORD_RESET, input, {
      displayName: input.displayName,
      resetUrl: input.actionUrl,
      expiresInMinutes: String(Math.max(1, Math.trunc(input.ttlMinutes))),
    });
  }

  async renderDeliveryTest(input: DeliveryTestInput): Promise<EmailMessage> {
    const content = await this.contentService.getPublishedEmailTemplate(
      CONTENT_KEYS.DELIVERY_TEST,
    );
    const appUrl = (
      this.configService.get<string>('PUBLIC_APP_URL') ?? 'https://localhost:3001'
    ).replace(/\/+$/, '');
    const values = {
      requestedBy: input.actorUsername,
      appUrl,
    };

    return this.render(content, input.to, values, appUrl);
  }

  private async renderActionTemplate(
    contentKey: EmailContentKey,
    input: VerificationInput,
    values: Record<string, string>,
  ): Promise<EmailMessage> {
    const content = await this.contentService.getPublishedEmailTemplate(contentKey);
    return this.render(content, input.to, values, input.actionUrl);
  }

  private render(
    content: EmailTemplateContent,
    to: string,
    values: Record<string, string>,
    actionUrl: string,
  ): EmailMessage {
    return renderManagedEmailTemplate({
      to,
      subject: this.interpolate(content.subject, values),
      preheader: this.interpolate(content.preheader, values),
      headline: this.interpolate(content.headline, values),
      body: this.interpolate(content.body, values),
      actionLabel: this.interpolate(content.ctaLabel, values),
      actionUrl,
      footer: this.interpolate(content.footer, values),
    });
  }

  private interpolate(template: string, values: Record<string, string>): string {
    return template.replace(
      /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g,
      (_match, variable: string) => values[variable] ?? '',
    );
  }
}
