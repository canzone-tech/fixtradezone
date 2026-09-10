import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  sumMatchingErc20Transfers,
} from './deposit-blockchain-verification.service';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
}

describe('deposit blockchain verification helpers', () => {
  it('converts deposit decimals to token base units without floating point math', () => {
    expect(decimalToBaseUnits('20.00000000', 18)).toBe(
      20_000_000_000_000_000_000n,
    );
    expect(decimalToBaseUnits('5.25', 6)).toBe(5_250_000n);
    expect(baseUnitsToDecimal(5_250_000n, 6)).toBe('5.25');
  });

  it('rejects precision that the token cannot represent', () => {
    expect(() => decimalToBaseUnits('1.0000001', 6)).toThrow(
      'Amount has more precision than the token supports.',
    );
  });

  it('sums only matching ERC20 Transfer events for the configured token and receiver', () => {
    const token = '0x1111111111111111111111111111111111111111';
    const receiver = '0x2222222222222222222222222222222222222222';
    const sender = '0x3333333333333333333333333333333333333333';
    const otherReceiver = '0x4444444444444444444444444444444444444444';

    const total = sumMatchingErc20Transfers(
      [
        {
          address: token,
          topics: [
            TRANSFER_TOPIC,
            addressTopic(sender),
            addressTopic(receiver),
          ],
          data: '0x0f4240',
        },
        {
          address: token,
          topics: [
            TRANSFER_TOPIC,
            addressTopic(sender),
            addressTopic(receiver),
          ],
          data: '0x1e8480',
        },
        {
          address: token,
          topics: [
            TRANSFER_TOPIC,
            addressTopic(sender),
            addressTopic(otherReceiver),
          ],
          data: '0x5f5e100',
        },
        {
          address: '0x5555555555555555555555555555555555555555',
          topics: [
            TRANSFER_TOPIC,
            addressTopic(sender),
            addressTopic(receiver),
          ],
          data: '0x5f5e100',
        },
      ],
      token,
      receiver,
    );

    expect(total).toBe(3_000_000n);
  });
});
