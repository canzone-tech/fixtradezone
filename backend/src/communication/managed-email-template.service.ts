import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailTemplateContent } from '../content/content.defaults';
import { ContentService } from '../content/content.service';
import type { EmailMessage } from './communication.types';
import { renderManagedEmailTemplate } from './email-template.renderer';

@Injectable()
export class ManagedEmailTemplateService {
  constructor(
    private readonly contentService: ContentService,
    private readonly configService: ConfigService,
  ) {}

  async apply(message: EmailMessage): Promise<EmailMessage> {
    const context = message.managedTemplate;
    if (!context) {
      return message;
    }

    const content = await this.contentService.getPublishedEmailTemplate(
      context.contentKey,
    );
    const appUrl = (
      this.configService.get<string>('PUBLIC_APP_URL') ??
      'https://localhost:3001'
    ).replace(/\/+$/, '');
    const values = {
      ...context.values,
      appUrl,
    };
    const actionUrl = context.actionUrl ?? appUrl;

    return this.render(content, message.to, values, actionUrl);
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

  private interpolate(
    template: string,
    values: Record<string, string>,
  ): string {
    return template.replace(
      /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g,
      (_match, variable: string) => values[variable] ?? '',
    );
  }
}
