import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailDeliveryResult, EmailMessage } from './communication.types';
import {
  sendViaSmtp,
  type SmtpEmailTransportConfig,
} from './smtp-email-transport';

type EmailTransportMode = 'CONSOLE' | 'HTTP' | 'SMTP';

@Injectable()
export class EmailTransportService {
  private readonly logger = new Logger(EmailTransportService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const mode = this.getMode();

    if (mode === 'CONSOLE') {
      this.logger.log(
        `[EMAIL:CONSOLE] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
      );

      return {
        transport: 'CONSOLE',
        accepted: true,
      };
    }

    if (mode === 'SMTP') {
      return this.sendSmtp(message);
    }

    return this.sendHttp(message);
  }

  getConfigurationStatus() {
    const mode = this.getMode();

    if (mode === 'CONSOLE') {
      return {
        mode,
        configured: true,
        fromEmail: this.getFromEmail(),
      };
    }

    if (mode === 'HTTP') {
      return {
        mode,
        configured: Boolean(
          this.configService.get<string>('COMMUNICATION_EMAIL_HTTP_URL'),
        ),
        fromEmail: this.getFromEmail(),
      };
    }

    const config = this.getSmtpConfig();
    const hasAuthPair = Boolean(config.username) === Boolean(config.password);

    return {
      mode,
      configured: Boolean(config.host && config.port && hasAuthPair),
      fromEmail: config.fromEmail,
      smtp: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        requireTls: config.requireTls,
        rejectUnauthorized: config.rejectUnauthorized,
        authenticationConfigured: Boolean(config.username && config.password),
      },
    };
  }

  private async sendSmtp(message: EmailMessage): Promise<EmailDeliveryResult> {
    const config = this.getSmtpConfig();

    if (!config.host) {
      throw new ServiceUnavailableException('SMTP host is not configured.');
    }

    try {
      await sendViaSmtp(config, message);
    } catch (error: unknown) {
      const messageText =
        error instanceof Error ? error.message : 'Unknown SMTP transport error';
      this.logger.error(`Email SMTP transport failed: ${messageText}`);
      throw new ServiceUnavailableException('Email delivery is unavailable.');
    }

    return {
      transport: 'SMTP',
      accepted: true,
    };
  }

  private async sendHttp(message: EmailMessage): Promise<EmailDeliveryResult> {
    const endpoint = this.configService.get<string>(
      'COMMUNICATION_EMAIL_HTTP_URL',
    );

    if (!endpoint) {
      throw new ServiceUnavailableException(
        'Email transport endpoint is not configured.',
      );
    }

    const bearerToken = this.configService.get<string>(
      'COMMUNICATION_EMAIL_HTTP_BEARER_TOKEN',
    );

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerToken
            ? {
                Authorization: `Bearer ${bearerToken}`,
              }
            : {}),
        },
        body: JSON.stringify({
          from: this.getFromEmail(),
          fromName: this.getFromName(),
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(this.getTimeoutMs()),
      });
    } catch (error: unknown) {
      const messageText =
        error instanceof Error
          ? error.message
          : 'Unknown email transport error';
      this.logger.error(`Email HTTP transport failed: ${messageText}`);
      throw new ServiceUnavailableException('Email delivery is unavailable.');
    }

    if (!response.ok) {
      this.logger.error(
        `Email HTTP transport returned ${response.status} ${response.statusText}.`,
      );
      throw new ServiceUnavailableException('Email delivery is unavailable.');
    }

    return {
      transport: 'HTTP',
      accepted: true,
    };
  }

  private getMode(): EmailTransportMode {
    return (
      this.configService.get<EmailTransportMode>('COMMUNICATION_EMAIL_MODE') ??
      'CONSOLE'
    );
  }

  private getSmtpConfig(): SmtpEmailTransportConfig {
    return {
      host: this.configService.get<string>('SMTP_HOST')?.trim() ?? '',
      port: this.configService.get<number>('SMTP_PORT') ?? 587,
      secure: this.configService.get<boolean>('SMTP_SECURE') ?? false,
      requireTls: this.configService.get<boolean>('SMTP_REQUIRE_TLS') ?? true,
      rejectUnauthorized:
        this.configService.get<boolean>('SMTP_REJECT_UNAUTHORIZED') ?? true,
      username: this.optionalConfig('SMTP_USER'),
      password: this.optionalConfig('SMTP_PASSWORD'),
      fromEmail: this.getFromEmail(),
      fromName: this.getFromName(),
      timeoutMs: this.getTimeoutMs(),
    };
  }

  private getFromEmail(): string {
    return (
      this.configService.get<string>('SMTP_FROM_EMAIL')?.trim() ||
      this.configService.get<string>('COMMUNICATION_EMAIL_FROM')?.trim() ||
      'no-reply@fixtradezone.local'
    );
  }

  private getFromName(): string | undefined {
    return this.optionalConfig('SMTP_FROM_NAME');
  }

  private getTimeoutMs(): number {
    return Math.max(
      1_000,
      this.configService.get<number>('COMMUNICATION_EMAIL_TIMEOUT_MS') ??
        10_000,
    );
  }

  private optionalConfig(key: string): string | undefined {
    const value = this.configService.get<string>(key)?.trim();
    return value ? value : undefined;
  }
}
