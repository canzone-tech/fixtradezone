import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

const toMoney = (value: Prisma.Decimal | number | string): string =>
  new Prisma.Decimal(value)
    .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(8);

interface DailyClaimRow {
  id: string;
  subscriptionId: string;
  userId: string;
  localTradeDate: Date | string;
  currency: string;
  dailyGrossRatePercent: Prisma.Decimal;
  dailyNetGrossAmount: Prisma.Decimal;
  userSharePercent: Prisma.Decimal;
  adminSharePercent: Prisma.Decimal;
  userAmount: Prisma.Decimal;
  adminAmount: Prisma.Decimal;
  tradeCount: number;
  status: 'PENDING' | 'CLAIMED';
  ledgerTransactionId: string | null;
  claimedAt: Date | null;
  createdAt: Date;
}

interface LedgerAccount {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: string;
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

@Injectable()
export class InternalTradingDailyClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async listMyClaims(
    userId: string,
    page = 1,
    limit = 25,
    subscriptionId?: string,
  ) {
    const safePage =
      Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
    const safeLimit =
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 25;
    const offset = (safePage - 1) * safeLimit;
    const subscriptionFilter = subscriptionId
      ? Prisma.sql`AND subscriptionId = ${subscriptionId}`
      : Prisma.empty;
    const claims = await this.prisma.$queryRaw<DailyClaimRow[]>(Prisma.sql`
      SELECT * FROM internal_trade_daily_claims
      WHERE userId = ${userId}
        ${subscriptionFilter}
      ORDER BY localTradeDate DESC, subscriptionId DESC
      LIMIT ${safeLimit} OFFSET ${offset}
    `);
    const totals = await this.prisma.$queryRaw<
      Array<{
        total: bigint;
        pendingCount: bigint;
        pendingAmount: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pendingCount,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN userAmount ELSE 0 END), 0)
          AS pendingAmount
      FROM internal_trade_daily_claims
      WHERE userId = ${userId}
        ${subscriptionFilter}
    `);
    return {
      page: safePage,
      limit: safeLimit,
      total: Number(totals[0]?.total ?? 0),
      pendingCount: Number(totals[0]?.pendingCount ?? 0),
      pendingAmount: toMoney(totals[0]?.pendingAmount ?? 0),
      claims: claims.map((row) => this.snapshot(row)),
    };
  }

  async claim(
    userId: string,
    claimId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    // The row lock and ledger's unique sourceKey serialize repeated requests.
    // No wallet posting happens when day has fewer than five slots.
    return this.prisma.$transaction(
      async (transaction) => {
        const rows = await transaction.$queryRaw<DailyClaimRow[]>(Prisma.sql`
        SELECT c.* FROM internal_trade_daily_claims c
        INNER JOIN internal_trade_subscription_states s
          ON s.subscriptionId = c.subscriptionId
        WHERE c.id = ${claimId}
          AND c.userId = ${userId}
          AND s.userId = ${userId}
          AND s.financialModelVersion = 'V2'
        LIMIT 1 FOR UPDATE
      `);
        const claim = rows[0];
        if (!claim) throw new NotFoundException('Daily claim not found.');
        if (claim.status === 'CLAIMED') {
          return { alreadyClaimed: true, claim: this.snapshot(claim) };
        }
        const gross = new Prisma.Decimal(claim.dailyNetGrossAmount);
        const user = new Prisma.Decimal(claim.userAmount);
        const admin = new Prisma.Decimal(claim.adminAmount);
        if (
          claim.tradeCount !== 5 ||
          gross.lte(0) ||
          user.lte(0) ||
          admin.lt(0) ||
          !user.add(admin).eq(gross) ||
          !new Prisma.Decimal(claim.userSharePercent)
            .add(claim.adminSharePercent)
            .eq(100)
        ) {
          throw new ServiceUnavailableException(
            'Claim financial snapshot is invalid.',
          );
        }
        const dayRows = await transaction.$queryRaw<
          Array<{ tradeCount: bigint; net: Prisma.Decimal }>
        >(
          Prisma.sql`
          SELECT COUNT(*) AS tradeCount,
            COALESCE(SUM(grossResultAmount), 0) AS net
          FROM internal_trade_events
          WHERE subscriptionId = ${claim.subscriptionId}
            AND localTradeDate = ${claim.localTradeDate}
            AND financialModelVersion = 'V2'
        `,
        );
        if (
          Number(dayRows[0]?.tradeCount ?? 0) !== 5 ||
          !new Prisma.Decimal(dayRows[0]?.net ?? 0).eq(gross)
        ) {
          throw new ConflictException(
            'Five canonical trades must reconcile before claiming.',
          );
        }
        const currency = claim.currency.toUpperCase();
        const expense = await this.requireAccount(transaction, {
          accountKey: `SYSTEM:INTERNAL_TRADING_RETURN_EXPENSE:${currency}`,
          ownerType: 'SYSTEM',
          ownerUserId: null,
          bucket: 'INTERNAL_TRADING_RETURN_EXPENSE',
          currency,
          normalSide: 'DEBIT',
        });
        const userAccount = await this.requireAccount(transaction, {
          accountKey: `USER:${userId}:PACKAGE_EARNINGS:${currency}`,
          ownerType: 'USER',
          ownerUserId: userId,
          bucket: 'PACKAGE_EARNINGS',
          currency,
          normalSide: 'CREDIT',
        });
        const adminAccount = await this.requireAccount(transaction, {
          accountKey: `SYSTEM:INTERNAL_TRADING_ADMIN_PROFIT:${currency}`,
          ownerType: 'SYSTEM',
          ownerUserId: null,
          bucket: 'INTERNAL_TRADING_ADMIN_PROFIT',
          currency,
          normalSide: 'CREDIT',
        });

        const txnId = randomUUID();
        await transaction.$executeRaw(Prisma.sql`
        INSERT INTO ledger_transactions (
          id, kind, sourceKey, sourceType, sourceId, currency,
          postedByUserId, description, metadata, postedAt, createdAt
        ) VALUES (
          ${txnId}, 'INTERNAL_TRADING_SETTLEMENT',
          ${`INTERNAL_TRADE_V2_DAILY_CLAIM:${claim.id}`},
          'INTERNAL_TRADING_DAILY_CLAIM', ${claim.id}, ${currency},
          ${actor.id}, ${`Daily trading profit claimed for ${claim.subscriptionId} on ${this.dateString(claim.localTradeDate)}.`},
          ${JSON.stringify({
            modelVersion: 'V2',
            subscriptionId: claim.subscriptionId,
            claimId: claim.id,
            localTradeDate: this.dateString(claim.localTradeDate),
            gross: toMoney(gross),
            user: toMoney(user),
            admin: toMoney(admin),
            userSharePercent: new Prisma.Decimal(
              claim.userSharePercent,
            ).toFixed(6),
            adminSharePercent: new Prisma.Decimal(
              claim.adminSharePercent,
            ).toFixed(6),
            simulationDisclosure: 'ALGORITHM_GENERATED',
          })},
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);
        await this.addEntry(
          transaction,
          txnId,
          expense.id,
          'DEBIT',
          toMoney(gross),
        );
        await this.addEntry(
          transaction,
          txnId,
          userAccount.id,
          'CREDIT',
          toMoney(user),
        );
        if (admin.gt(0)) {
          await this.addEntry(
            transaction,
            txnId,
            adminAccount.id,
            'CREDIT',
            toMoney(admin),
          );
        }
        const sums = await transaction.$queryRaw<
          Array<{
            side: 'DEBIT' | 'CREDIT';
            total: Prisma.Decimal;
          }>
        >(Prisma.sql`
        SELECT side, SUM(amount) AS total
        FROM ledger_entries
        WHERE transactionId = ${txnId}
        GROUP BY side
      `);
        if (
          !new Prisma.Decimal(
            sums.find((row) => row.side === 'DEBIT')?.total ?? 0,
          ).eq(
            new Prisma.Decimal(
              sums.find((row) => row.side === 'CREDIT')?.total ?? -1,
            ),
          )
        ) {
          throw new ServiceUnavailableException(
            'Daily claim ledger is not balanced.',
          );
        }
        await this.applyBalance(transaction, expense, 'DEBIT', toMoney(gross));
        await this.applyBalance(
          transaction,
          userAccount,
          'CREDIT',
          toMoney(user),
        );
        if (admin.gt(0)) {
          await this.applyBalance(
            transaction,
            adminAccount,
            'CREDIT',
            toMoney(admin),
          );
        }
        const claimedAt = new Date();
        const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE internal_trade_daily_claims
        SET status = 'CLAIMED', ledgerTransactionId = ${txnId},
          claimedAt = ${claimedAt}
        WHERE id = ${claim.id} AND status = 'PENDING'
      `);
        if (updated !== 1)
          throw new ConflictException('Claim was already processed.');
        await transaction.$executeRaw(Prisma.sql`
        UPDATE internal_trade_subscription_states SET
          userCreditedAmount = userCreditedAmount + ${toMoney(user)},
          adminRecognizedAmount = adminRecognizedAmount + ${toMoney(admin)},
          revision = revision + 1, updatedAt = CURRENT_TIMESTAMP(3)
        WHERE subscriptionId = ${claim.subscriptionId}
          AND financialModelVersion = 'V2'
      `);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'CREATE',
            entityType: 'InternalTradingDailyClaim',
            entityId: claim.id,
            description:
              'User claimed completed V2 trading day; balanced immutable ledger posted.',
            metadata: {
              operation: 'CLAIM_DAILY_TRADING_PROFIT',
              claimId: claim.id,
              subscriptionId: claim.subscriptionId,
              ledgerTransactionId: txnId,
              userAmount: toMoney(user),
              adminAmount: toMoney(admin),
              grossAmount: toMoney(gross),
              currency,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
        return {
          alreadyClaimed: false,
          claim: this.snapshot({
            ...claim,
            status: 'CLAIMED',
            ledgerTransactionId: txnId,
            claimedAt,
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private snapshot(row: DailyClaimRow) {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      localTradeDate: this.dateString(row.localTradeDate),
      currency: row.currency,
      dailyGrossRatePercent: new Prisma.Decimal(
        row.dailyGrossRatePercent,
      ).toFixed(6),
      dailyNetGrossAmount: toMoney(row.dailyNetGrossAmount),
      userSharePercent: new Prisma.Decimal(row.userSharePercent).toFixed(6),
      adminSharePercent: new Prisma.Decimal(row.adminSharePercent).toFixed(6),
      userAmount: toMoney(row.userAmount),
      adminAmount: toMoney(row.adminAmount),
      tradeCount: row.tradeCount,
      status: row.status,
      claimedAt: row.claimedAt,
      createdAt: row.createdAt,
    };
  }

  private dateString(value: Date | string) {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value).slice(0, 10);
  }

  private async requireAccount(
    tx: Prisma.TransactionClient,
    expected: Omit<LedgerAccount, 'id'>,
  ): Promise<LedgerAccount> {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id, accountKey, ownerType, ownerUserId, bucket, currency,
        normalSide, createdAt
      ) VALUES (
        ${randomUUID()}, ${expected.accountKey}, ${expected.ownerType},
        ${expected.ownerUserId}, ${expected.bucket}, ${expected.currency},
        ${expected.normalSide}, CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);
    const rows = await tx.$queryRaw<LedgerAccount[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket,
        currency, normalSide FROM ledger_accounts
      WHERE accountKey = ${expected.accountKey} LIMIT 1 FOR UPDATE
    `);
    const account = rows[0];
    if (
      !account ||
      account.ownerType !== expected.ownerType ||
      account.ownerUserId !== expected.ownerUserId ||
      account.bucket !== expected.bucket ||
      account.currency !== expected.currency ||
      account.normalSide !== expected.normalSide
    ) {
      throw new ServiceUnavailableException(
        'Daily claim ledger account mismatch.',
      );
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ledger_account_balances (accountId, balance, revision, updatedAt)
      VALUES (${account.id}, 0, 0, CURRENT_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE accountId = VALUES(accountId)
    `);
    return account;
  }

  private async addEntry(
    tx: Prisma.TransactionClient,
    transactionId: string,
    accountId: string,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
  ) {
    if (new Prisma.Decimal(amount).lte(0)) {
      throw new ServiceUnavailableException('Ledger entries must be positive.');
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries
        (id, transactionId, accountId, side, amount, memo, createdAt)
      VALUES (
        ${randomUUID()}, ${transactionId}, ${accountId}, ${side},
        ${amount}, 'Internal trading V2 daily claim', CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async applyBalance(
    tx: Prisma.TransactionClient,
    account: LedgerAccount,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
  ) {
    const direction = side === account.normalSide ? 1 : -1;
    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE ledger_account_balances SET
        balance = balance + (${direction} * CAST(${amount} AS DECIMAL(20,8))),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (${direction} * CAST(${amount} AS DECIMAL(20,8))) >= 0
    `);
    if (updated !== 1)
      throw new ConflictException('Daily claim balance update rejected.');
  }
}
