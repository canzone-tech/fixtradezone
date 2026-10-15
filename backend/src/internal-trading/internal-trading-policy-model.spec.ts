import { PrismaService } from '../database/prisma.service';
import { InternalTradingService } from './internal-trading.service';

describe('Existing Internal Trading Policy V1/V2 publication configuration', () => {
  const service = new InternalTradingService({} as PrismaService);
  const internal = service as unknown as {
    normalizedPolicyConfig(row: unknown): Record<string, unknown>;
    validatePolicyConfig(config: unknown): void;
    policySnapshot(row: unknown): Record<string, unknown>;
  };

  const policy = {
    id: 'policy-1',
    versionNumber: 3,
    status: 'DRAFT',
    revision: 1,
    financialModelVersion: 'V1',
    enabled: true,
    activitiesPerDay: 5,
    assetSymbols: ['BTCUSDT'],
    winWeight: 3,
    lossWeight: 2,
    winMinimumPercent: '0.500000',
    winMaximumPercent: '2.500000',
    lossMinimumPercent: '0.250000',
    lossMaximumPercent: '1.500000',
    timingWindows: [{ start: '00:00', end: '23:59' }],
    userSharePercent: '70.000000',
    adminSharePercent: '30.000000',
    timezoneSnapshot: null,
    effectiveFrom: null,
    effectiveTo: null,
    publishedAt: null,
  };

  it('exposes the persisted model without replacing published policy infrastructure', () => {
    const v1 = internal.policySnapshot(policy);
    const v2 = internal.policySnapshot({
      ...policy,
      financialModelVersion: 'V2',
    });
    expect(v1.financialModelVersion).toBe('V1');
    expect(v2.financialModelVersion).toBe('V2');
    expect(v2.userSharePercent).toBe('70.000000');
    expect(v2.adminSharePercent).toBe('30.000000');
  });

  it('permits an existing V1 policy with more than five slots', () => {
    const config = internal.normalizedPolicyConfig({
      ...policy,
      activitiesPerDay: 6,
    });
    expect(() => internal.validatePolicyConfig(config)).not.toThrow();
  });

  it('accepts a five-slot V2 policy with the existing split rules', () => {
    const config = internal.normalizedPolicyConfig({
      ...policy,
      financialModelVersion: 'V2',
    });
    expect(() => internal.validatePolicyConfig(config)).not.toThrow();
  });

  it('rejects V2 policies containing any number other than five slots', () => {
    const config = internal.normalizedPolicyConfig({
      ...policy,
      financialModelVersion: 'V2',
      activitiesPerDay: 6,
    });
    expect(() => internal.validatePolicyConfig(config)).toThrow(
      'V2 requires exactly five trades per day.',
    );
  });

  it('rejects an unknown model rather than implicitly choosing V1', () => {
    const config = internal.normalizedPolicyConfig({
      ...policy,
      financialModelVersion: 'V3',
    });
    expect(() => internal.validatePolicyConfig(config)).toThrow(
      'Financial model must be V1 or V2.',
    );
  });
});
