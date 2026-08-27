import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PublishCommissionPlanDto,
  UpdateCommissionPlanDto,
} from './commission.dto';

function validDraftPayload() {
  return {
    expectedRevision: 1,
    reason: 'Review COMM-01 draft configuration.',
    firstPurchaseEnabled: true,
    newPurchaseEnabled: true,
    activePackageRequired: true,
    inactiveUplineAction: 'LOST',
    compressionMode: 'SKIP',
    releaseMode: 'IMMEDIATE',
    holdPeriodHours: 0,
    levels: [
      {
        level: 1,
        enabled: true,
        ratePercent: '20.000000',
        packageMatchingEnabled: true,
      },
      {
        level: 2,
        enabled: true,
        ratePercent: '8.000000',
        packageMatchingEnabled: true,
      },
    ],
  };
}

describe('Referral commission DTOs', () => {
  it('accepts reviewed exact-decimal level rates', async () => {
    const dto = plainToInstance(UpdateCommissionPlanDto, validDraftPayload());

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects JavaScript numbers for commission rates', async () => {
    const dto = plainToInstance(UpdateCommissionPlanDto, {
      ...validDraftPayload(),
      levels: [
        {
          level: 1,
          enabled: true,
          ratePercent: 20,
          packageMatchingEnabled: true,
        },
      ],
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('levels');
  });

  it('rejects zero and greater-than-100 percentage strings', async () => {
    for (const ratePercent of ['0', '100.000001']) {
      const dto = plainToInstance(UpdateCommissionPlanDto, {
        ...validDraftPayload(),
        levels: [
          {
            level: 1,
            enabled: true,
            ratePercent,
            packageMatchingEnabled: true,
          },
        ],
      });

      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toContain('levels');
    }
  });

  it('allows publish-now semantics and rejects non-ISO timestamps', async () => {
    const publishNow = plainToInstance(PublishCommissionPlanDto, {
      expectedRevision: 2,
      reason: 'Publish reviewed COMM-01 plan.',
    });
    await expect(validate(publishNow)).resolves.toHaveLength(0);

    const invalid = plainToInstance(PublishCommissionPlanDto, {
      expectedRevision: 2,
      reason: 'Publish reviewed COMM-01 plan.',
      effectiveFrom: 'tomorrow',
    });
    const errors = await validate(invalid);

    expect(errors.map((error) => error.property)).toContain('effectiveFrom');
  });
});
