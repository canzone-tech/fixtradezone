import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { CAPTCHA_PURPOSE_METADATA_KEY } from './require-captcha.decorator';
import { CaptchaService } from './captcha.service';
import { CaptchaPurpose } from './captcha.types';

interface CaptchaRequestFields {
  captchaId?: string;
  captchaAnswer?: string;
}

@Injectable()
export class CaptchaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly captchaService: CaptchaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const purpose = this.reflector.get<CaptchaPurpose>(
      CAPTCHA_PURPOSE_METADATA_KEY,
      context.getHandler(),
    );

    if (!purpose) {
      throw new InternalServerErrorException(
        'CAPTCHA guard purpose is not configured.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const body: unknown = request.body;
    const fields = this.readCaptchaFields(body);

    await this.captchaService.verifyIfEnabled(
      purpose,
      fields.captchaId,
      fields.captchaAnswer,
    );

    return true;
  }

  private readCaptchaFields(body: unknown): CaptchaRequestFields {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return {};
    }

    const record = body as Record<string, unknown>;

    return {
      captchaId:
        typeof record.captchaId === 'string' ? record.captchaId : undefined,
      captchaAnswer:
        typeof record.captchaAnswer === 'string'
          ? record.captchaAnswer
          : undefined,
    };
  }
}
