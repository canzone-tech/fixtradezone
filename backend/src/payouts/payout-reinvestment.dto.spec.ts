import { validate } from 'class-validator';
import { ReinvestPayoutDto } from './dto/payout.dto';

describe('payout reinvestment request contract', () => {
  it('accepts an idempotent package reinvestment request', async () => {
    const dto = Object.assign(new ReinvestPayoutDto(), {
      requestKey: '11111111-1111-4111-8111-111111111111',
      packagePlanItemId: '22222222-2222-4222-8222-222222222222',
      amount: '25.00000000',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects malformed reinvestment amount input', async () => {
    const dto = Object.assign(new ReinvestPayoutDto(), {
      requestKey: '11111111-1111-4111-8111-111111111111',
      packagePlanItemId: '22222222-2222-4222-8222-222222222222',
      amount: '-1',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'amount')).toBe(true);
  });
});
