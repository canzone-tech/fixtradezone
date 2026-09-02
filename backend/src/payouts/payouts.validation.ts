import {
  isValidDepositAddress,
  normalizeDepositTransactionId,
} from '../deposits/deposit.validation';
import type { DepositValidationProfile } from '../deposits/deposits.constants';
import type { PayoutValidationProfile } from './payouts.constants';

function asDepositProfile(
  profile: PayoutValidationProfile,
): DepositValidationProfile {
  return profile;
}

export function isValidPayoutAddress(
  profile: PayoutValidationProfile,
  value: string,
): boolean {
  return isValidDepositAddress(asDepositProfile(profile), value.trim());
}

export function normalizePayoutTransactionId(
  profile: PayoutValidationProfile,
  value: string,
): string | null {
  return normalizeDepositTransactionId(
    asDepositProfile(profile),
    value.trim(),
  );
}
