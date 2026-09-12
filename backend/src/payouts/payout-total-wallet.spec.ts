import { allocateTotalWallet } from './payout-total-wallet';

describe('allocateTotalWallet', () => {
  it('uses referral commission when it is the only funded wallet bucket', () => {
    expect(
      allocateTotalWallet(
        [
          { bucket: 'MAIN', balance: '0' },
          { bucket: 'PACKAGE_EARNINGS', balance: '0' },
          { bucket: 'REFERRAL_COMMISSION', balance: '21' },
          { bucket: 'REWARDS', balance: '0' },
        ],
        '10',
      ),
    ).toEqual([
      { bucket: 'REFERRAL_COMMISSION', amount: '10.00000000' },
    ]);
  });

  it('spans buckets deterministically and preserves Main / Deposit until last', () => {
    expect(
      allocateTotalWallet(
        [
          { bucket: 'MAIN', balance: '10' },
          { bucket: 'PACKAGE_EARNINGS', balance: '4' },
          { bucket: 'REFERRAL_COMMISSION', balance: '3' },
          { bucket: 'REWARDS', balance: '2' },
        ],
        '12',
      ),
    ).toEqual([
      { bucket: 'PACKAGE_EARNINGS', amount: '4.00000000' },
      { bucket: 'REFERRAL_COMMISSION', amount: '3.00000000' },
      { bucket: 'REWARDS', amount: '2.00000000' },
      { bucket: 'MAIN', amount: '3.00000000' },
    ]);
  });

  it('fails closed when Total Wallet is insufficient', () => {
    expect(
      allocateTotalWallet(
        [
          { bucket: 'MAIN', balance: '1' },
          { bucket: 'REFERRAL_COMMISSION', balance: '2' },
        ],
        '4',
      ),
    ).toBeNull();
  });
});
