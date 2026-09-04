import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ReportWindowQueryDto } from './dto/report.dto';

type Scalar = bigint | number | string | Prisma.Decimal | null;
type AggregateRow = Record<string, Scalar>;

interface WalletBalanceRow {
  bucket: string;
  currency: string;
  balance: Scalar;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: ReportWindowQueryDto) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid report from date.');
    }

    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid report to date.');
    }

    if (from && to && from >= to) {
      throw new BadRequestException(
        'Report to date must be later than the from date.',
      );
    }

    const usersCreatedCondition = Prisma.sql`
      ${from ? Prisma.sql`createdAt >= ${from}` : Prisma.sql`TRUE`}
      AND ${to ? Prisma.sql`createdAt < ${to}` : Prisma.sql`TRUE`}
    `;
    const depositsWindow = Prisma.sql`
      ${from ? Prisma.sql`AND createdAt >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND createdAt < ${to}` : Prisma.empty}
    `;
    const subscriptionsWindow = Prisma.sql`
      ${from ? Prisma.sql`AND activatedAt >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND activatedAt < ${to}` : Prisma.empty}
    `;
    const commissionsWindow = Prisma.sql`
      ${from ? Prisma.sql`AND createdAt >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND createdAt < ${to}` : Prisma.empty}
    `;
    const rewardsWindow = Prisma.sql`
      ${from ? Prisma.sql`AND postedAt >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND postedAt < ${to}` : Prisma.empty}
    `;
    const payoutsWindow = Prisma.sql`
      ${from ? Prisma.sql`AND createdAt >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND createdAt < ${to}` : Prisma.empty}
    `;
    const ledgerWindow = Prisma.sql`
      ${from ? Prisma.sql`AND lt.postedAt >= ${from}` : Prisma.empty}
      ${to ? Prisma.sql`AND lt.postedAt < ${to}` : Prisma.empty}
    `;

    const [
      userRows,
      depositRows,
      subscriptionRows,
      commissionRows,
      rewardRows,
      payoutRows,
      ledgerRows,
      walletRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'RESTRICTED' THEN 1 ELSE 0 END) AS restricted,
          SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) AS suspended,
          SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN ${usersCreatedCondition} THEN 1 ELSE 0 END) AS createdInWindow
        FROM users
      `),
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'AWAITING_TXID' THEN 1 ELSE 0 END) AS awaitingTxid,
          SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pendingReview,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
          COALESCE(SUM(amount), 0) AS requestedAmount,
          COALESCE(
            SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END),
            0
          ) AS approvedAmount
        FROM deposits
        WHERE 1 = 1
          ${depositsWindow}
      `),
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'SUPERSEDED' THEN 1 ELSE 0 END) AS superseded,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
          COALESCE(SUM(price), 0) AS activatedPackageValue
        FROM user_package_subscriptions
        WHERE 1 = 1
          ${subscriptionsWindow}
      `),
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'AVAILABLE' THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) AS lost,
          COALESCE(SUM(commissionAmount), 0) AS calculatedAmount,
          COALESCE(
            SUM(CASE WHEN status = 'AVAILABLE' THEN commissionAmount ELSE 0 END),
            0
          ) AS availableAmount
        FROM referral_commission_events
        WHERE 1 = 1
          ${commissionsWindow}
      `),
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(calculatedReward), 0) AS calculatedAmount,
          COALESCE(SUM(postedReward), 0) AS postedAmount,
          SUM(CASE WHEN clippedToCap = TRUE THEN 1 ELSE 0 END) AS clippedToCap
        FROM package_reward_events
        WHERE 1 = 1
          ${rewardsWindow}
      `),
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pendingReview,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) AS submitted,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
          COALESCE(SUM(grossAmount), 0) AS grossAmount,
          COALESCE(SUM(feeAmount), 0) AS feeAmount,
          COALESCE(SUM(netAmount), 0) AS netAmount,
          COALESCE(
            SUM(CASE WHEN status = 'COMPLETED' THEN netAmount ELSE 0 END),
            0
          ) AS completedNetAmount
        FROM payout_requests
        WHERE 1 = 1
          ${payoutsWindow}
      `),
      this.prisma.$queryRaw<AggregateRow[]>(Prisma.sql`
        SELECT
          COUNT(DISTINCT lt.id) AS transactionCount,
          COALESCE(
            SUM(CASE WHEN le.side = 'DEBIT' THEN le.amount ELSE 0 END),
            0
          ) AS debitTotal,
          COALESCE(
            SUM(CASE WHEN le.side = 'CREDIT' THEN le.amount ELSE 0 END),
            0
          ) AS creditTotal
        FROM ledger_transactions lt
        INNER JOIN ledger_entries le ON le.transactionId = lt.id
        WHERE 1 = 1
          ${ledgerWindow}
      `),
      this.prisma.$queryRaw<WalletBalanceRow[]>(Prisma.sql`
        SELECT
          la.bucket,
          la.currency,
          COALESCE(SUM(lab.balance), 0) AS balance
        FROM ledger_accounts la
        INNER JOIN ledger_account_balances lab ON lab.accountId = la.id
        WHERE la.ownerType = 'USER'
        GROUP BY la.bucket, la.currency
        ORDER BY la.currency ASC, la.bucket ASC
      `),
    ]);

    const users = this.first(userRows);
    const deposits = this.first(depositRows);
    const subscriptions = this.first(subscriptionRows);
    const commissions = this.first(commissionRows);
    const rewards = this.first(rewardRows);
    const payouts = this.first(payoutRows);
    const ledger = this.first(ledgerRows);

    const debitTotal = this.money(ledger.debitTotal);
    const creditTotal = this.money(ledger.creditTotal);

    return {
      generatedAt: new Date().toISOString(),
      window: {
        from: from?.toISOString() ?? null,
        toExclusive: to?.toISOString() ?? null,
      },
      users: {
        total: this.count(users.total),
        active: this.count(users.active),
        restricted: this.count(users.restricted),
        suspended: this.count(users.suspended),
        blocked: this.count(users.blocked),
        pending: this.count(users.pending),
        createdInWindow: this.count(users.createdInWindow),
      },
      deposits: {
        total: this.count(deposits.total),
        awaitingTxid: this.count(deposits.awaitingTxid),
        pendingReview: this.count(deposits.pendingReview),
        approved: this.count(deposits.approved),
        rejected: this.count(deposits.rejected),
        requestedAmount: this.money(deposits.requestedAmount),
        approvedAmount: this.money(deposits.approvedAmount),
      },
      subscriptions: {
        total: this.count(subscriptions.total),
        active: this.count(subscriptions.active),
        completed: this.count(subscriptions.completed),
        superseded: this.count(subscriptions.superseded),
        cancelled: this.count(subscriptions.cancelled),
        activatedPackageValue: this.money(subscriptions.activatedPackageValue),
      },
      commissions: {
        total: this.count(commissions.total),
        available: this.count(commissions.available),
        pending: this.count(commissions.pending),
        lost: this.count(commissions.lost),
        calculatedAmount: this.money(commissions.calculatedAmount),
        availableAmount: this.money(commissions.availableAmount),
      },
      rewards: {
        total: this.count(rewards.total),
        calculatedAmount: this.money(rewards.calculatedAmount),
        postedAmount: this.money(rewards.postedAmount),
        clippedToCap: this.count(rewards.clippedToCap),
      },
      payouts: {
        total: this.count(payouts.total),
        pendingReview: this.count(payouts.pendingReview),
        approved: this.count(payouts.approved),
        submitted: this.count(payouts.submitted),
        completed: this.count(payouts.completed),
        rejected: this.count(payouts.rejected),
        grossAmount: this.money(payouts.grossAmount),
        feeAmount: this.money(payouts.feeAmount),
        netAmount: this.money(payouts.netAmount),
        completedNetAmount: this.money(payouts.completedNetAmount),
      },
      ledger: {
        transactionCount: this.count(ledger.transactionCount),
        debitTotal,
        creditTotal,
        balanced: new Prisma.Decimal(debitTotal).equals(creditTotal),
      },
      currentUserWalletBalances: walletRows.map((row) => ({
        bucket: row.bucket,
        currency: row.currency,
        balance: this.money(row.balance),
      })),
    };
  }

  private first(rows: AggregateRow[]): AggregateRow {
    return rows[0] ?? {};
  }

  private count(value: Scalar | undefined): number {
    if (value === undefined || value === null) return 0;
    return Number(value.toString());
  }

  private money(value: Scalar | undefined): string {
    if (value === undefined || value === null) return '0.00000000';
    return new Prisma.Decimal(value.toString()).toFixed(8);
  }
}
