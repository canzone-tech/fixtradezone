import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePackagePlanItemDto,
  PublishPackagePlanDto,
  UpdatePackagePlanDto,
} from './package-plan.dto';

function validItemPayload() {
  return {
    expectedRevision: 1,
    reason: 'Add the reviewed package terms.',
    packageCode: 'NEURAL_SCOUT',
    displayName: 'Neural Scout',
    slug: 'neural-scout',
    sortOrder: 1,
    availability: 'AVAILABLE',
    price: '5.00000000',
    currency: 'USDT',
    rewardRateMode: 'RANDOM_RANGE',
    fixedRewardRate: null,
    minimumRewardRate: '0.400000',
    maximumRewardRate: '0.600000',
    rewardRateMeaning: 'USER_NET_AFTER_SPLIT',
    capBasis: 'TOTAL_RETURN',
    capMultiplier: '2.0000',
    principalTreatment: 'INCLUDED_IN_TOTAL_RETURN',
    goalDays: 90,
    cycleDays: 10,
    rewardStartMode: 'NEXT_CALENDAR_DAY',
    rewardFrequency: 'DAILY_CALENDAR',
    cycleDayMode: 'CALENDAR_DAYS',
    rewardDayMode: 'EVERY_DAY',
    cycleEndAction: 'AUTO_START_NEXT_CYCLE',
    capReachedAction: 'COMPLETE_PACKAGE',
  };
}

describe('Package plan DTOs', () => {
  it('accepts typed integer fields and decimal strings for a reviewed item', async () => {
    const dto = plainToInstance(CreatePackagePlanItemDto, validItemPayload());

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects JavaScript numbers for monetary and percentage values', async () => {
    const dto = plainToInstance(CreatePackagePlanItemDto, {
      ...validItemPayload(),
      price: 5,
      minimumRewardRate: 0.4,
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(['price', 'minimumRewardRate']),
    );
  });

  it('rejects package-plan timezone changes because Platform Operations owns timezone', async () => {
    const dto = plainToInstance(UpdatePackagePlanDto, {
      expectedRevision: 2,
      reason: 'Attempt a duplicate timezone override.',
      settlementTimezone: 'UTC',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain(
      'settlementTimezone',
    );
  });

  it('allows publish-now semantics without an explicit effectiveFrom', async () => {
    const dto = plainToInstance(PublishPackagePlanDto, {
      expectedRevision: 4,
      reason: 'Founder reviewed and approved the complete plan.',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a non-ISO publication timestamp', async () => {
    const dto = plainToInstance(PublishPackagePlanDto, {
      expectedRevision: 4,
      reason: 'Founder reviewed and approved the complete plan.',
      effectiveFrom: 'tomorrow',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('effectiveFrom');
  });
});
