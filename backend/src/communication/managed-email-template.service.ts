import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_ALLOWED_VARIABLES,
  type EmailContentKey,
  type EmailTemplateContent,
  isEmailContentKey,
} from '../content/content.defaults';
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
    if (!context) return message;

    const content = await this.contentService.getPublishedEmailTemplate(
      context.contentKey,
    );
    const appUrl = this.getAppUrl();
    const values = { ...context.values, appUrl };
    const actionUrl = context.actionUrl ?? appUrl;
    return this.render(content, message.to, values, actionUrl);
  }

  renderControlledTest(
    rawContentKey: string,
    content: EmailTemplateContent,
    to: string,
    actorUsername: string,
  ): EmailMessage {
    const contentKey = this.assertContentKey(rawContentKey);
    this.assertAllowedVariables(contentKey, content);
    const appUrl = this.getAppUrl();
    const test = this.getControlledTestContext(
      contentKey,
      actorUsername,
      appUrl,
    );
    return this.render(content, to, test.values, test.actionUrl);
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

  private assertContentKey(rawContentKey: string): EmailContentKey {
    const contentKey = rawContentKey.trim().toUpperCase();
    if (!isEmailContentKey(contentKey)) {
      throw new NotFoundException('Email template not found.');
    }
    return contentKey;
  }

  private assertAllowedVariables(
    contentKey: EmailContentKey,
    content: EmailTemplateContent,
  ): void {
    const allowed = new Set(EMAIL_ALLOWED_VARIABLES[contentKey]);
    const variablePattern = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
    for (const value of Object.values(content)) {
      for (const match of value.matchAll(variablePattern)) {
        const variable = match[1];
        if (!allowed.has(variable)) {
          throw new BadRequestException(
            `Template variable {{${variable}}} is not allowed for ${contentKey}.`,
          );
        }
      }
    }
  }

  private getControlledTestContext(
    contentKey: EmailContentKey,
    actorUsername: string,
    appUrl: string,
  ): { values: Record<string, string>; actionUrl: string } {
    const displayName = 'FixTradeZone Test User';
    const supportUrl = `${appUrl}/user/support`;

    switch (contentKey) {
      case 'EMAIL_VERIFICATION': {
        const verificationUrl = `${appUrl}/verify-email?token=CONTROLLED_TEST_ONLY`;
        return {
          values: { displayName, verificationUrl, expiresInMinutes: '30' },
          actionUrl: verificationUrl,
        };
      }
      case 'PASSWORD_RESET': {
        const resetUrl = `${appUrl}/reset-password?token=CONTROLLED_TEST_ONLY`;
        return {
          values: { displayName, resetUrl, expiresInMinutes: '30' },
          actionUrl: resetUrl,
        };
      }
      case 'WELCOME':
        return {
          values: { displayName, userCode: '100000', appUrl },
          actionUrl: `${appUrl}/login`,
        };
      case 'MARKETING_OFFER': {
        const offerUrl = `${appUrl}/user/packages`;
        return {
          values: {
            displayName,
            offerTitle: 'FixTradeZone Test Offer',
            offerSummary:
              'This is controlled preview content and is not a live promotion.',
            offerUrl,
            unsubscribeUrl: `${appUrl}/user/profile`,
          },
          actionUrl: offerUrl,
        };
      }
      case 'DELIVERY_TEST':
        return {
          values: {
            requestedBy: actorUsername.trim() || 'SUPER_ADMIN',
            appUrl,
          },
          actionUrl: appUrl,
        };
      case 'SUPPORT_TICKET_CREATED':
        return {
          values: {
            displayName,
            ticketNumber: 'FTZ-CONTROLLED-TEST',
            subject: 'Controlled support template test',
            status: 'OPEN',
            ticketUrl: supportUrl,
          },
          actionUrl: supportUrl,
        };
      case 'SUPPORT_TICKET_REPLY':
        return {
          values: {
            displayName,
            ticketNumber: 'FTZ-CONTROLLED-TEST',
            subject: 'Controlled support template test',
            ticketUrl: supportUrl,
          },
          actionUrl: supportUrl,
        };
      case 'SUPPORT_TICKET_STATUS_CHANGED':
        return {
          values: {
            displayName,
            ticketNumber: 'FTZ-CONTROLLED-TEST',
            subject: 'Controlled support template test',
            status: 'IN_PROGRESS',
            ticketUrl: supportUrl,
          },
          actionUrl: supportUrl,
        };
    }
  }

  private getAppUrl(): string {
    return (
      this.configService.get<string>('PUBLIC_APP_URL') ??
      'https://localhost:3001'
    ).replace(/\/+$/, '');
  }
}
