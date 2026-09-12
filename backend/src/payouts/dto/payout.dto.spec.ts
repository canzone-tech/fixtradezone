import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePayoutDto,
  UpdatePayoutPolicyDraftDto,
} from './payout.dto';

const REQUEST_KEY = '11111111-1111-4111-8111-111111111111';

function hasError(
  errors: Awaited<ReturnType<typeof validate>>,
  property: string,
): boolean {
  return errors.some((error) => error.property === property);
}

describe('payout bucket business rule', () => {
  it('accepts MAIN as the only USER payout source', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      requestKey: REQUEST_KEY,
      sourceBucket: 'MAIN',
      amount: '5',
      destinationAddress: '0x1111111111111111111111111111111111111111',
    });

    const errors = await validate(dto);

    expect(hasError(errors, 'sourceBucket')).toBe(false);
  });

  it.each(['PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS'])(
    'rejects %s as a USER payout source',
    async (sourceBucket) => {
      const dto = plainToInstance(CreatePayoutDto, {
        requestKey: REQUEST_KEY,
        sourceBucket,
        amount: '5',
        destinationAddress: '0x1111111111111111111111111111111111111111',
      });

      const errors = await validate(dto);

      expect(hasError(errors, 'sourceBucket')).toBe(true);
    },
  );

  it('rejects payout policy configuration that enables a non-MAIN bucket', async () => {
    const dto = plainToInstance(UpdatePayoutPolicyDraftDto, {
      expectedRevision: 1,
      enabledBuckets: ['MAIN', 'REFERRAL_COMMISSION'],
    });

    const errors = await validate(dto);

    expect(hasError(errors, 'enabledBuckets')).toBe(true);
  });
});
