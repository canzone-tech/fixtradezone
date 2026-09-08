import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
  };

  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsService(prisma as unknown as PrismaService);
  });

  it('rejects an inverted report window before querying accounting data', async () => {
    await expect(
      service.getOverview({
        from: '2026-09-05T12:00:00.000Z',
        to: '2026-09-05T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps financial values separated by currency and balances ledger per currency', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          total: 3,
          active: 2,
          restricted: 0,
          suspended: 0,
          blocked: 0,
          pending: 1,
          createdInWindow: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          total: 2,
          awaitingTxid: 0,
          pendingReview: 0,
          approved: 2,
          rejected: 0,
          requestedAmount: '110.00000000',
          approvedAmount: '110.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          total: 1,
          active: 1,
          completed: 0,
          superseded: 0,
          cancelled: 0,
          activatedPackageValue: '100.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          total: 1,
          available: 1,
          pending: 0,
          lost: 0,
          calculatedAmount: '5.00000000',
          availableAmount: '5.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          total: 1,
          calculatedAmount: '2.00000000',
          postedAmount: '2.00000000',
          clippedToCap: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          total: 1,
          pendingReview: 0,
          approved: 0,
          submitted: 0,
          completed: 1,
          rejected: 0,
          grossAmount: '10.00000000',
          feeAmount: '1.00000000',
          netAmount: '9.00000000',
          completedNetAmount: '9.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          transactionCount: 4,
          debitTotal: '117.00000000',
          creditTotal: '117.00000000',
        },
      ])
      .mockResolvedValueOnce([
        { bucket: 'MAIN', currency: 'USDT', balance: '50.00000000' },
        { bucket: 'MAIN', currency: 'BTC', balance: '0.25000000' },
      ])
      .mockResolvedValueOnce([
        {
          currency: 'USDT',
          total: 1,
          requestedAmount: '100.00000000',
          approvedAmount: '100.00000000',
        },
        {
          currency: 'BTC',
          total: 1,
          requestedAmount: '10.00000000',
          approvedAmount: '10.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          currency: 'USDT',
          total: 1,
          activatedPackageValue: '100.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          currency: 'USDT',
          total: 1,
          calculatedAmount: '5.00000000',
          availableAmount: '5.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          currency: 'USDT',
          total: 1,
          calculatedAmount: '2.00000000',
          postedAmount: '2.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          currency: 'BTC',
          total: 1,
          grossAmount: '10.00000000',
          feeAmount: '1.00000000',
          netAmount: '9.00000000',
          completedNetAmount: '9.00000000',
        },
      ])
      .mockResolvedValueOnce([
        {
          currency: 'BTC',
          transactionCount: 1,
          debitTotal: '10.00000000',
          creditTotal: '10.00000000',
        },
        {
          currency: 'USDT',
          transactionCount: 3,
          debitTotal: '107.00000000',
          creditTotal: '107.00000000',
        },
      ]);

    const report = await service.getOverview({});

    expect(report.currencies).toEqual(['BTC', 'USDT']);
    expect(report.financialByCurrency.deposits).toEqual([
      {
        currency: 'USDT',
        total: 1,
        requestedAmount: '100.00000000',
        approvedAmount: '100.00000000',
      },
      {
        currency: 'BTC',
        total: 1,
        requestedAmount: '10.00000000',
        approvedAmount: '10.00000000',
      },
    ]);
    expect(report.ledger.balanced).toBe(true);
    expect(report.ledger.byCurrency).toEqual([
      {
        currency: 'BTC',
        transactionCount: 1,
        debitTotal: '10.00000000',
        creditTotal: '10.00000000',
        balanced: true,
      },
      {
        currency: 'USDT',
        transactionCount: 3,
        debitTotal: '107.00000000',
        creditTotal: '107.00000000',
        balanced: true,
      },
    ]);
  });
});
