import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailDeliveryResult, EmailMessage } from './communication.types';

@Injectable()
export class EmailTransportService {
  private readonly logger = new Logger(EmailTransportService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const mode =
      this.configService.get<'CONSOLE' | 'HTTP'>('COMMUNICATION_EMAIL_MODE') ??
      'CONSOLE';

    if (mode === 'CONSOLE') {
      this.logger.log(
        `[EMAIL:CONSOLE] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
      );

      return {
        transport: 'CONSOLE',
        accepted: true,
      };
    }

    const endpoint = this.configService.get<string>(
      'COMMUNICATION_EMAIL_HTTP_URL',
    );

    if (!endpoint) {
      throw new ServiceUnavailableException(
        'Email transport endpoint is not configured.',
      );
    }

    const from =
      this.configService.get<string>('COMMUNICATION_EMAIL_FROM') ??
      'no-reply@fixtradezone.local';
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
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
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
}
