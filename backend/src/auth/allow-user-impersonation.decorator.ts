import { SetMetadata } from '@nestjs/common';

export const ALLOW_USER_IMPERSONATION_KEY = 'allowUserImpersonation';

export const AllowUserImpersonation = () =>
  SetMetadata(ALLOW_USER_IMPERSONATION_KEY, true);
