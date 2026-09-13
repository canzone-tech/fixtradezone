import type { ConfigService } from '@nestjs/config';
import { EmailTransportService } from './email-transport.service';

function configService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : fallback,
    ),
  } as unknown as ConfigService;
}

describe('EmailTransportService configuration status', () => {
  it('reports safe SMTP readiness without exposing credentials', () => {
    const service = new EmailTransportService(
      configService({
        COMMUNICATION_EMAIL_MODE: 'SMTP',
        COMMUNICATION_EMAIL_TIMEOUT_MS: 10_000,
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        SMTP_REQUIRE_TLS: true,
        SMTP_REJECT_UNAUTHORIZED: true,
        SMTP_USER: 'mailer-user',
        SMTP_PASSWORD: 'mailer-secret',
        SMTP_FROM_EMAIL: 'no-reply@example.com',
        SMTP_FROM_NAME: 'FixTradeZone',
      }),
    );

    const status = service.getConfigurationStatus();

    expect(status).toEqual({
      mode: 'SMTP',
      configured: true,
      fromEmail: 'no-reply@example.com',
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTls: true,
        rejectUnauthorized: true,
        authenticationConfigured: true,
      },
    });
    expect(JSON.stringify(status)).not.toContain('mailer-user');
    expect(JSON.stringify(status)).not.toContain('mailer-secret');
  });
});
