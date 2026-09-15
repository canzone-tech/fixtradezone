import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DEFAULT_EMAIL_CONTENT } from '../content/content.defaults';
import type { ContentService } from '../content/content.service';
import { ManagedEmailTemplateService } from './managed-email-template.service';

describe('ManagedEmailTemplateService controlled tests', () => {
  const contentService = {} as ContentService;
  const configService = {
    get: jest.fn((key: string) =>
      key === 'PUBLIC_APP_URL' ? 'https://app.example.test/' : undefined,
    ),
  } as unknown as ConfigService;

  const service = new ManagedEmailTemplateService(
    contentService,
    configService,
  );

  it('renders the welcome template with safe sample account values', () => {
    const message = service.renderControlledTest(
      'WELCOME',
      DEFAULT_EMAIL_CONTENT.WELCOME,
      'owner@example.com',
      'founder',
    );

    expect(message.to).toBe('owner@example.com');
    expect(message.subject).toBe('Welcome to FixTradeZone');
    expect(message.text).toContain('100000');
    expect(message.text).toContain('Open FixTradeZone');
    expect(message.html).toContain('https://app.example.test/login');
  });

  it('renders a marketing offer as controlled preview content', () => {
    const message = service.renderControlledTest(
      'MARKETING_OFFER',
      DEFAULT_EMAIL_CONTENT.MARKETING_OFFER,
      'owner@example.com',
      'founder',
    );

    expect(message.subject).toContain('FixTradeZone Test Offer');
    expect(message.text).toContain('not a live promotion');
    expect(message.text).toContain('/user/profile');
  });

  it('rejects variables outside the content-key allowlist', () => {
    expect(() =>
      service.renderControlledTest(
        'WELCOME',
        {
          ...DEFAULT_EMAIL_CONTENT.WELCOME,
          body: 'Secret {{passwordHash}}',
        },
        'owner@example.com',
        'founder',
      ),
    ).toThrow(BadRequestException);
  });
});
