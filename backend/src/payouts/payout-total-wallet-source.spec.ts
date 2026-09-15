import {
  PAYOUT_SPENDABLE_BUCKETS,
  isPayoutWalletBucket,
  payoutTotalWalletEventKey,
} from './payouts.constants';

describe('Total Wallet payout source lock', () => {
  it('allows only Total Wallet for new payout requests', () => {
    expect(PAYOUT_SPENDABLE_BUCKETS).toEqual(['TOTAL_WALLET']);
  });

  it('keeps component buckets distinct from Total Wallet', () => {
    expect(isPayoutWalletBucket('MAIN')).toBe(true);
    expect(isPayoutWalletBucket('PACKAGE_EARNINGS')).toBe(true);
    expect(isPayoutWalletBucket('REFERRAL_COMMISSION')).toBe(true);
    expect(isPayoutWalletBucket('REWARDS')).toBe(true);
    expect(isPayoutWalletBucket('TOTAL_WALLET')).toBe(false);
  });

  it('uses immutable payout-scoped Total Wallet event keys', () => {
    expect(payoutTotalWalletEventKey('payout-1', 'RESERVE')).toBe(
      'PAYOUT:payout-1:TOTAL_WALLET:RESERVE',
    );
    expect(payoutTotalWalletEventKey('payout-1', 'RELEASE')).toBe(
      'PAYOUT:payout-1:TOTAL_WALLET:RELEASE',
    );
  });
});
