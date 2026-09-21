import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  DepositBlockchainVerificationService,
  isBlockAtOrAfterDepositCheckpoint,
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

  it('accepts a transaction mined in the same second as the deposit checkpoint', () => {
    const checkpoint = new Date('2026-09-21T05:30:00.900Z');
    const blockTimestampSeconds = Math.floor(checkpoint.getTime() / 1000);

    expect(
      isBlockAtOrAfterDepositCheckpoint(
        `0x${blockTimestampSeconds.toString(16)}`,
        checkpoint,
      ),
    ).toBe(true);
  });

  it('rejects a transaction mined before the deposit checkpoint second', () => {
    const checkpoint = new Date('2026-09-21T05:30:00.000Z');
    const blockTimestampSeconds = Math.floor(checkpoint.getTime() / 1000) - 1;

    expect(
      isBlockAtOrAfterDepositCheckpoint(
        `0x${blockTimestampSeconds.toString(16)}`,
        checkpoint,
      ),
    ).toBe(false);
  });
});

describe('DepositBlockchainVerificationService checkpoint enforcement', () => {
  function candidate(paymentCheckpointAt: Date | null) {
    return {
      depositId: '11111111-1111-4111-8111-111111111111',
      amount: '5',
      currency: 'USDT',
      txid: 'a'.repeat(64),
      assignedWalletAddress: '0x2222222222222222222222222222222222222222',
      assignedNetwork: 'BEP20',
      assignedValidationProfile: 'EVM',
      paymentCheckpointAt,
      paymentRailId: '22222222-2222-4222-8222-222222222222',
      railNetworkCode: 'BEP20',
      railValidationProfile: 'EVM',
      verificationMode: 'VERIFY_ONLY',
      chainId: 56,
      tokenContractAddress: '0x1111111111111111111111111111111111111111',
      tokenDecimals: 18,
      requiredConfirmations: 12,
    };
  }

  it('fails an otherwise genuine receipt when its block predates the payment-session checkpoint', async () => {
    const service = new DepositBlockchainVerificationService(
      {} as never,
      {} as never,
    );
    const rpc = jest
      .spyOn(
        service as unknown as {
          rpc: (method: string, params: unknown[]) => Promise<unknown>;
        },
        'rpc',
      )
      .mockImplementation((method: string) => {
        switch (method) {
          case 'eth_chainId':
            return Promise.resolve('0x38');
          case 'eth_getTransactionReceipt':
            return Promise.resolve({
              status: '0x1',
              blockNumber: '0x64',
              logs: [],
            });
          case 'eth_getBlockByNumber':
            return Promise.resolve({ timestamp: '0x64' });
          default:
            return Promise.reject(new Error(`Unexpected RPC method ${method}`));
        }
      });

    const result = await (
      service as unknown as {
        performVerification: (candidate: Record<string, unknown>) => Promise<{
          status: string;
          failureCode: string | null;
          blockNumber: string | null;
        }>;
      }
    ).performVerification(
      candidate(new Date('2026-09-21T05:30:00.000Z')),
    );

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: 'TX_BEFORE_DEPOSIT_CHECKPOINT',
      blockNumber: '100',
    });
    expect(rpc).toHaveBeenCalledWith('eth_getBlockByNumber', ['0x64', false]);
  });

  it('does not apply the new timestamp gate to historical deposits without a checkpoint', async () => {
    const service = new DepositBlockchainVerificationService(
      {} as never,
      {} as never,
    );
    const rpc = jest
      .spyOn(
        service as unknown as {
          rpc: (method: string, params: unknown[]) => Promise<unknown>;
        },
        'rpc',
      )
      .mockImplementation((method: string) => {
        switch (method) {
          case 'eth_chainId':
            return Promise.resolve('0x38');
          case 'eth_getTransactionReceipt':
            return Promise.resolve({
              status: '0x1',
              blockNumber: '0x64',
              logs: [],
            });
          default:
            return Promise.reject(new Error(`Unexpected RPC method ${method}`));
        }
      });

    const result = await (
      service as unknown as {
        performVerification: (candidate: Record<string, unknown>) => Promise<{
          status: string;
          failureCode: string | null;
        }>;
      }
    ).performVerification(candidate(null));

    expect(result).toMatchObject({
      status: 'FAILED',
      failureCode: 'TRANSFER_NOT_FOUND',
    });
    expect(rpc).not.toHaveBeenCalledWith(
      'eth_getBlockByNumber',
      expect.any(Array),
    );
  });
});
