import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AwardRewardsService } from './award-rewards.service';
import type { AwardRewardTrackInputDto } from './dto/award-reward.dto';

interface InternalAwardRewardsService {
  validateMatrix(
    transaction: Prisma.TransactionClient,
    levelCount: number,
    asset: string,
    enabled: boolean,
    tracks: AwardRewardTrackInputDto[],
  ): Promise<
    Array<{
      packageDefinitionId: string;
      packageCode: string;
      packageDisplayName: string;
      trackOrder: number;
      awardAmount: string;
      levels: Array<string | null>;
    }>
  >;
  findNextCandidate(
    transaction: Prisma.TransactionClient,
    userId: string,
    policy: {
      id: string;
      versionNumber: number;
      status: 'DRAFT' | 'PUBLISHED';
      revision: number;
      enabled: boolean;
      levelCount: number;
      asset: string;
      effectiveFrom: Date | null;
      effectiveTo: Date | null;
      publishedAt: Date | null;
      clonedFromPolicyVersionId: string | null;
      createdByUserId: string | null;
      updatedByUserId: string | null;
      publishedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ): Promise<unknown>;
}

function sqlText(value: unknown) {
  if (typeof value !== 'object' || value === null || !('strings' in value)) {
    return String(value);
  }
  return (value as { strings: readonly string[] }).strings.join('?');
}

describe('AwardRewardsService policy matrix', () => {
  const packageDefinitionId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const policyId = '33333333-3333-4333-8333-333333333333';
  const now = new Date('2026-09-08T00:00:00.000Z');

  function serviceAndTransaction() {
    const prisma = {} as PrismaService;
    const service = new AwardRewardsService(prisma);
    const queryRaw = jest.fn();
    const transaction = {
      $queryRaw: queryRaw,
    } as unknown as Prisma.TransactionClient;
    return {
      service: service as unknown as InternalAwardRewardsService,
      transaction,
      queryRaw,
    };
  }

  it('supports configurable level counts and preserves blank levels as NOT_REQUIRED', async () => {
    const { service, transaction, queryRaw } = serviceAndTransaction();
    queryRaw.mockResolvedValue([
      {
        packageDefinitionId,
        packageCode: 'CRYPTOBOT',
        displayName: 'CryptoBot',
        sortOrder: 1,
        versionNumber: 1,
      },
    ]);

    const matrix = await service.validateMatrix(transaction, 4, 'usdt', true, [
      {
        packageDefinitionId,
        trackOrder: 1,
        awardAmount: '50',
        levels: [
          { requiredBusiness: '500' },
          { requiredBusiness: '1000' },
          { requiredBusiness: '5000' },
          { requiredBusiness: null },
        ],
      },
    ]);

    expect(matrix).toEqual([
      {
        packageDefinitionId,
        packageCode: 'CRYPTOBOT',
        packageDisplayName: 'CryptoBot',
        trackOrder: 1,
        awardAmount: '50.00000000',
        levels: ['500.00000000', '1000.00000000', '5000.00000000', null],
      },
    ]);
  });

  it('rejects a package row that does not match the configured number of levels', async () => {
    const { service, transaction } = serviceAndTransaction();

    await expect(
      service.validateMatrix(transaction, 4, 'USDT', true, [
        {
          packageDefinitionId,
          trackOrder: 1,
          awardAmount: '50',
          levels: [
            { requiredBusiness: '500' },
            { requiredBusiness: '1000' },
            { requiredBusiness: '5000' },
          ],
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('selects only a later ACTIVE, not-yet-awarded package in track order', async () => {
    const { service, transaction, queryRaw } = serviceAndTransaction();
    let candidateQuery: unknown = null;

    queryRaw
      .mockImplementationOnce(() => Promise.resolve([{ maxOrder: 1 }]))
      .mockImplementationOnce((query: unknown) => {
        candidateQuery = query;
        return Promise.resolve([
          {
            sourceSubscriptionId: '44444444-4444-4444-8444-444444444444',
            packageDefinitionId,
            packageCode: 'ELITEBOT',
            packageDisplayName: 'EliteBot',
            policyTrackId: '55555555-5555-4555-8555-555555555555',
            trackOrder: 3,
            awardAmount: new Prisma.Decimal('500'),
          },
        ]);
      });

    const result = await service.findNextCandidate(transaction, userId, {
      id: policyId,
      versionNumber: 1,
      status: 'PUBLISHED',
      revision: 1,
      enabled: true,
      levelCount: 4,
      asset: 'USDT',
      effectiveFrom: now,
      effectiveTo: null,
      publishedAt: now,
      clonedFromPolicyVersionId: null,
      createdByUserId: null,
      updatedByUserId: null,
      publishedByUserId: null,
      createdAt: now,
      updatedAt: now,
    });

    expect(result).toMatchObject({
      packageCode: 'ELITEBOT',
      trackOrder: 3,
    });
    expect(queryRaw).toHaveBeenCalledTimes(2);

    const candidateSql = sqlText(candidateQuery);
    expect(candidateSql).toContain("ups.status = 'ACTIVE'");
    expect(candidateSql).toContain('arpt.trackOrder >');
    expect(candidateSql).toContain('existing.id IS NULL');
    expect(candidateSql).toContain('ORDER BY arpt.trackOrder ASC');
  });
});
