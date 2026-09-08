import {
  isValidPayoutAddress,
  normalizePayoutTransactionId,
} from './payouts.validation';

describe('payout validation', () => {
  it('rejects malformed TRON addresses', () => {
    expect(
      isValidPayoutAddress('TRON', 'TInvalidAddressForTestingOnly123'),
    ).toBe(false);
  });

  it('normalizes valid-format TRON transaction ids', () => {
    const txid = 'A'.repeat(64);
    expect(normalizePayoutTransactionId('TRON', txid)).toBe('a'.repeat(64));
  });

  it('rejects malformed TRON transaction ids', () => {
    expect(
      normalizePayoutTransactionId('TRON', 'not-a-transaction-id'),
    ).toBeNull();
  });

  it('normalizes EVM transaction ids without 0x', () => {
    const txid = `0x${'B'.repeat(64)}`;
    expect(normalizePayoutTransactionId('EVM', txid)).toBe('b'.repeat(64));
  });
});
