import { SetMetadata } from '@nestjs/common';

import { CaptchaPurpose } from './captcha.types';

export const CAPTCHA_PURPOSE_METADATA_KEY = 'captcha:purpose';

export const RequireCaptcha = (purpose: CaptchaPurpose) =>
  SetMetadata(CAPTCHA_PURPOSE_METADATA_KEY, purpose);
