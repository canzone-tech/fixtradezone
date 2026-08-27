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
import type {
  AdminLedgerQueryDto,
  AdminWalletQueryDto,
  WalletPageQueryDto,
} from './dto/wallet.dto';
import {
  USER_WALLET_BUCKETS,
  WALLET_AUDIT_OPERATIONS,
  depositClearingAccountKey,
  depositCreditSourceKey,
  type LedgerSide,
  type UserWalletBucket,
  userWalletAccountKey,
} from './wallet.constants';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type DecimalValue = Prisma.Decimal | number | string;
type WalletAuditOperation =
  (typeof WALLET_AUDIT_OPERATIONS)[keyof typeof WALLET_AUDIT_OPERATIONS];
type LedgerAccountBucket = UserWalletBucket | 'DEPOSIT_CLEARING';

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: LedgerAccountBucket;
  currency: string;
  normalSide: LedgerSide;
}

interface LedgerTransactionRow {
  id: string;
  kind: 'DEPOSIT_CREDIT';
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  currency: string;
  postedByUserId: string | null;
  description: string;
  metadata: Prisma.JsonValue | null;
  postedAt: Date;
  createdAt: Date;
}

interface LedgerEntryRow {
  id: string;
  transactionId: string;
  accountId: string;
  side: LedgerSide;
  amount: DecimalValue;
  memo: string | null;
  createdAt: Date;
  accountKey?: string;
  ownerType?: 'SYSTEM' | 'USER';
  ownerUserId?: string | null;
  bucket?: LedgerAccountBucket;
  currency?: string;
}

interface ApprovedDepositAccountingSource {
  id: string;
  userId: string;
  status: string;
  amount: Prisma.Decimal;
  currency: string;
  txid: string | null;
  assignedNetwork: string;
  packageCode: string;
  packageDisplayName: string;
  reviewedAt: Date | null;
}

interface WalletBucketRow {
  bucket: UserWalletBucket;
  currency: string;
  balance: DecimalValue;
}

interface WalletActivityRow {
  transactionId: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  description: string;
  currency: string;
  postedAt: Date;
  side: LedgerSide;
  amount: DecimalValue;
  bucket: UserWalletBucket;
}

interface AdminWalletRow {
  userId: string;
  username: string;
  email: string | null;
  currency: string;
  mainBalance: DecimalValue;
  packageEarningsBalance: DecimalValue;
  referralCommissionBalance: DecimalValue;
  rewardsBalance: DecimalValue;
  totalBalance: DecimalValue;
}

interface CountRow {
  total: bigint | number | string;
}

interface UnpostedDepositRow {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  packageDisplayName: string;
  amount: DecimalValue;
  currency: string;
  assignedNetwork: string;
  txid: string | null;
  reviewedAt: Date | null;
}

@Injectable()
export class WalletLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyWallet(userId: string, query: WalletPageQueryDto) {
    const bucketRows = await this.prisma.$queryRaw<
      WalletBucketRow[]
    >(Prisma.sql`
      SELECT
        la.bucket,
        la.currency,
        COALESCE(lb.balance, 0.00000000) AS balance
      FROM ledger_accounts la
      LEFT JOIN ledger_account_balances lb ON lb.accountId = la.id
      WHERE la.ownerType = 'USER'
        AND la.ownerUserId = ${userId}
      ORDER BY la.currency ASC,
        FIELD(
          la.bucket,
          'MAIN',
          'PACKAGE_EARNINGS',
          'REFERRAL_COMMISSION',
          'REWARDS'
        ) ASC
    `);

    const skip = (query.page - 1) * query.limit;
    const activity = await this.prisma.$queryRaw<
      WalletActivityRow[]
    >(Prisma.sql`
      SELECT
        lt.id AS transactionId,
        lt.kind,
        lt.sourceType,
        lt.sourceId,
        lt.description,
        lt.currency,
        lt.postedAt,
        le.side,
        le.amount,
        la.bucket
      FROM ledger_entries le
      INNER JOIN ledger_transactions lt ON lt.id = le.transactionId
      INNER JOIN ledger_accounts la ON la.id = le.accountId
      WHERE la.ownerType = 'USER'
        AND la.ownerUserId = ${userId}
      ORDER BY lt.postedAt DESC, le.createdAt DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);

    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM ledger_entries le
      INNER JOIN ledger_accounts la ON la.id = le.accountId
      WHERE la.ownerType = 'USER'
        AND la.ownerUserId = ${userId}
    `);

    return {
      wallets: this.buildWalletCurrencies(bucketRows),
      activity: activity.map((row) => ({
        transactionId: row.transactionId,
        kind: row.kind,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        description: row.description,
        currency: row.currency,
        postedAt: row.postedAt,
        bucket: row.bucket,
        direction: row.side,
        amount: this.decimalString(row.amount),
      })),
      page: query.page,
      limit: query.limit,
      totalActivity: this.countNumber(countRows[0]?.total),
    };
  }

  async listWallets(query: AdminWalletQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const userFilter = query.userId
      ? Prisma.sql`AND la.ownerUserId = ${query.userId}`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND la.currency = ${query.currency}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<AdminWalletRow[]>(Prisma.sql`
      SELECT
        u.id AS userId,
        u.username,
        u.email,
        la.currency,
        SUM(
          CASE WHEN la.bucket = 'MAIN'
            THEN COALESCE(lb.balance, 0)
            ELSE 0
          END
        ) AS mainBalance,
        SUM(
          CASE WHEN la.bucket = 'PACKAGE_EARNINGS'
            THEN COALESCE(lb.balance, 0)
            ELSE 0
          END
        ) AS packageEarningsBalance,
        SUM(
          CASE WHEN la.bucket = 'REFERRAL_COMMISSION'
            THEN COALESCE(lb.balance, 0)
            ELSE 0
          END
        ) AS referralCommissionBalance,
        SUM(
          CASE WHEN la.bucket = 'REWARDS'
            THEN COALESCE(lb.balance, 0)
            ELSE 0
          END
        ) AS rewardsBalance,
        SUM(COALESCE(lb.balance, 0)) AS totalBalance
      FROM ledger_accounts la
      INNER JOIN users u ON u.id = la.ownerUserId
      LEFT JOIN ledger_account_balances lb ON lb.accountId = la.id
      WHERE la.ownerType = 'USER'
        ${userFilter}
        ${currencyFilter}
      GROUP BY u.id, u.username, u.email, la.currency
      ORDER BY u.username ASC, la.currency ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);

    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM (
        SELECT la.ownerUserId, la.currency
        FROM ledger_accounts la
        WHERE la.ownerType = 'USER'
          ${userFilter}
          ${currencyFilter}
        GROUP BY la.ownerUserId, la.currency
      ) grouped_wallets
    `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
      wallets: rows.map((row) => ({
        userId: row.userId,
        username: row.username,
        email: row.email,
        currency: row.currency,
        buckets: {
          main: this.decimalString(row.mainBalance),
          packageEarnings: this.decimalString(row.packageEarningsBalance),
          referralCommission: this.decimalString(row.referralCommissionBalance),
          rewards: this.decimalString(row.rewardsBalance),
        },
        totalWallet: this.decimalString(row.totalBalance),
      })),
    };
  }

  async listLedger(query: AdminLedgerQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const actorFilter = query.postedByUserId
      ? Prisma.sql`AND lt.postedByUserId = ${query.postedByUserId}`
      : Prisma.empty;
    const currencyFilter = query.currency
      ? Prisma.sql`AND lt.currency = ${query.currency}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<LedgerTransactionRow[]>(Prisma.sql`
      SELECT lt.*
      FROM ledger_transactions lt
      WHERE 1 = 1
        ${actorFilter}
        ${currencyFilter}
      ORDER BY lt.postedAt DESC, lt.id DESC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM ledger_transactions lt
      WHERE 1 = 1
        ${actorFilter}
        ${currencyFilter}
    `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
      transactions: rows.map((row) => this.transactionSnapshot(row)),
    };
  }

  async getLedgerTransaction(transactionId: string) {
    const rows = await this.prisma.$queryRaw<LedgerTransactionRow[]>(Prisma.sql`
      SELECT lt.*
      FROM ledger_transactions lt
      WHERE lt.id = ${transactionId}
      LIMIT 1
    `);
    const transaction = rows[0];
    if (!transaction) {
      throw new NotFoundException('Ledger transaction was not found.');
    }

    const entries = await this.prisma.$queryRaw<LedgerEntryRow[]>(Prisma.sql`
      SELECT
        le.*,
        la.accountKey,
        la.ownerType,
        la.ownerUserId,
        la.bucket,
        la.currency
      FROM ledger_entries le
      INNER JOIN ledger_accounts la ON la.id = le.accountId
      WHERE le.transactionId = ${transactionId}
      ORDER BY le.createdAt ASC, le.id ASC
    `);

    return {
      transaction: this.transactionSnapshot(transaction),
      entries: entries.map((entry) => this.entrySnapshot(entry)),
      balanced: this.entriesBalanced(entries),
    };
  }

  async listUnpostedApprovedDeposits(query: WalletPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<UnpostedDepositRow[]>(Prisma.sql`
      SELECT
        d.id,
        d.userId,
        u.username,
        u.email,
        d.packageDisplayName,
        d.amount,
        d.currency,
        d.assignedNetwork,
        d.txid,
        d.reviewedAt
      FROM deposits d
      INNER JOIN users u ON u.id = d.userId
      LEFT JOIN ledger_transactions lt
        ON lt.sourceKey = CONCAT('DEPOSIT:', d.id, ':CREDIT')
      WHERE d.status = 'APPROVED'
        AND lt.id IS NULL
      ORDER BY d.reviewedAt ASC, d.id ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `);
    const countRows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM deposits d
      LEFT JOIN ledger_transactions lt
        ON lt.sourceKey = CONCAT('DEPOSIT:', d.id, ':CREDIT')
      WHERE d.status = 'APPROVED'
        AND lt.id IS NULL
    `);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(countRows[0]?.total),
      deposits: rows.map((row) => ({
        ...row,
        amount: this.decimalString(row.amount),
      })),
    };
  }

  async reconcileApprovedDeposit(
    depositId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const deposit = await transaction.deposit.findUnique({
        where: { id: depositId },
        select: {
          id: true,
          userId: true,
          status: true,
          amount: true,
          currency: true,
          txid: true,
          assignedNetwork: true,
          packageCode: true,
          packageDisplayName: true,
          reviewedAt: true,
        },
      });

      if (!deposit) {
        throw new NotFoundException('Deposit was not found.');
      }
      if (deposit.status !== 'APPROVED') {
        throw new ConflictException(
          'Only an approved deposit may be posted into accounting.',
        );
      }

      return this.postApprovedDepositInTransaction(
        transaction,
        deposit,
        actor,
        context,
        WALLET_AUDIT_OPERATIONS.RECONCILE_DEPOSIT,
      );
    });
  }

  async postApprovedDepositInTransaction(
    transaction: Prisma.TransactionClient,
    deposit: ApprovedDepositAccountingSource,
    actor: AuthenticatedUser,
    context: RequestContext = {},
    operation: WalletAuditOperation = WALLET_AUDIT_OPERATIONS.POST_DEPOSIT,
  ) {
    if (deposit.status !== 'APPROVED') {
      throw new ConflictException(
        'Only an approved deposit may be posted into accounting.',
      );
    }

    const currency = deposit.currency.toUpperCase();
    const amount = deposit.amount.toFixed(8);
    if (new Prisma.Decimal(amount).lte(0)) {
      throw new ConflictException(
        'Deposit accounting amount must be positive.',
      );
    }

    const sourceKey = depositCreditSourceKey(deposit.id);
    const proposedTransactionId = randomUUID();
    const metadata = {
      depositId: deposit.id,
      userId: deposit.userId,
      txid: deposit.txid,
      network: deposit.assignedNetwork,
      packageCode: deposit.packageCode,
      packageDisplayName: deposit.packageDisplayName,
      reviewedAt: deposit.reviewedAt?.toISOString() ?? null,
      walletBucket: 'MAIN',
      packageActivationApplied: false,
      referralCommissionApplied: false,
      rewardsApplied: false,
    };

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_transactions (
        id,
        kind,
        sourceKey,
        sourceType,
        sourceId,
        currency,
        postedByUserId,
        description,
        metadata,
        postedAt,
        createdAt
      ) VALUES (
        ${proposedTransactionId},
        'DEPOSIT_CREDIT',
        ${sourceKey},
        'DEPOSIT',
        ${deposit.id},
        ${currency},
        ${actor.id},
        ${`Approved deposit ${deposit.id} credited to Main / Deposit Balance.`},
        ${JSON.stringify(metadata)},
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE sourceKey = VALUES(sourceKey)
    `);

    const transactionRows = await transaction.$queryRaw<
      LedgerTransactionRow[]
    >(Prisma.sql`
      SELECT lt.*
      FROM ledger_transactions lt
      WHERE lt.sourceKey = ${sourceKey}
      LIMIT 1
      FOR UPDATE
    `);
    const ledgerTransaction = transactionRows[0];
    if (!ledgerTransaction) {
      throw new ServiceUnavailableException(
        'Accounting transaction could not be established.',
      );
    }

    const existingEntryCount = await transaction.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*) AS total
        FROM ledger_entries
        WHERE transactionId = ${ledgerTransaction.id}
      `,
    );
    if (this.countNumber(existingEntryCount[0]?.total) > 0) {
      return {
        message: 'Deposit accounting was already posted.',
        created: false,
        transaction: this.transactionSnapshot(ledgerTransaction),
      };
    }

    const userAccounts = await this.ensureUserWalletAccounts(
      transaction,
      deposit.userId,
      currency,
    );
    const mainAccount = userAccounts.MAIN;
    const clearingAccount = await this.ensureAccount(transaction, {
      accountKey: depositClearingAccountKey(currency),
      ownerType: 'SYSTEM',
      ownerUserId: null,
      bucket: 'DEPOSIT_CLEARING',
      currency,
      normalSide: 'DEBIT',
    });

    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: clearingAccount.id,
      side: 'DEBIT',
      amount,
      memo: `Deposit ${deposit.id} clearing debit.`,
    });
    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: mainAccount.id,
      side: 'CREDIT',
      amount,
      memo: `Deposit ${deposit.id} Main / Deposit Balance credit.`,
    });

    await this.applyBalance(transaction, clearingAccount, 'DEBIT', amount);
    await this.applyBalance(transaction, mainAccount, 'CREDIT', amount);

    const entries = await transaction.$queryRaw<LedgerEntryRow[]>(Prisma.sql`
      SELECT le.*
      FROM ledger_entries le
      WHERE le.transactionId = ${ledgerTransaction.id}
      ORDER BY le.createdAt ASC, le.id ASC
    `);
    if (!this.entriesBalanced(entries)) {
      throw new ServiceUnavailableException(
        'Ledger transaction is not balanced; posting was aborted.',
      );
    }

    await transaction.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'CREATE',
        entityType: 'LedgerTransaction',
        entityId: ledgerTransaction.id,
        description: 'Approved deposit posted to immutable wallet ledger.',
        metadata: {
          source: 'WALLET_LEDGER',
          operation,
          sourceKey,
          depositId: deposit.id,
          userId: deposit.userId,
          amount,
          currency,
          debitAccount: clearingAccount.accountKey,
          creditAccount: mainAccount.accountKey,
          balanced: true,
          packageActivationApplied: false,
          referralCommissionApplied: false,
          rewardsApplied: false,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      message: 'Approved deposit posted to Main / Deposit Balance.',
      created: true,
      transaction: this.transactionSnapshot(ledgerTransaction),
    };
  }

  private async ensureUserWalletAccounts(
    transaction: Prisma.TransactionClient,
    userId: string,
    currency: string,
  ): Promise<Record<UserWalletBucket, LedgerAccountRow>> {
    const accounts = {} as Record<UserWalletBucket, LedgerAccountRow>;

    for (const bucket of USER_WALLET_BUCKETS) {
      accounts[bucket] = await this.ensureAccount(transaction, {
        accountKey: userWalletAccountKey(userId, bucket, currency),
        ownerType: 'USER',
        ownerUserId: userId,
        bucket,
        currency,
        normalSide: 'CREDIT',
      });
    }

    return accounts;
  }

  private async ensureAccount(
    transaction: Prisma.TransactionClient,
    input: Omit<LedgerAccountRow, 'id'>,
  ): Promise<LedgerAccountRow> {
    const id = randomUUID();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id,
        accountKey,
        ownerType,
        ownerUserId,
        bucket,
        currency,
        normalSide,
        createdAt
      ) VALUES (
        ${id},
        ${input.accountKey},
        ${input.ownerType},
        ${input.ownerUserId},
        ${input.bucket},
        ${input.currency},
        ${input.normalSide},
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);

    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT
        id,
        accountKey,
        ownerType,
        ownerUserId,
        bucket,
        currency,
        normalSide
      FROM ledger_accounts
      WHERE accountKey = ${input.accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];
    if (!account) {
      throw new ServiceUnavailableException(
        'Ledger account could not be established.',
      );
    }

    if (
      account.ownerType !== input.ownerType ||
      account.ownerUserId !== input.ownerUserId ||
      account.bucket !== input.bucket ||
      account.currency !== input.currency ||
      account.normalSide !== input.normalSide
    ) {
      throw new ServiceUnavailableException(
        'Ledger account key conflicts with existing account semantics.',
      );
    }

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_account_balances (
        accountId,
        balance,
        revision,
        updatedAt
      ) VALUES (
        ${account.id},
        0.00000000,
        0,
        CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountId = VALUES(accountId)
    `);

    return account;
  }

  private async insertEntry(
    transaction: Prisma.TransactionClient,
    input: {
      transactionId: string;
      accountId: string;
      side: LedgerSide;
      amount: string;
      memo: string;
    },
  ) {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id,
        transactionId,
        accountId,
        side,
        amount,
        memo,
        createdAt
      ) VALUES (
        ${randomUUID()},
        ${input.transactionId},
        ${input.accountId},
        ${input.side},
        ${input.amount},
        ${input.memo},
        CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async applyBalance(
    transaction: Prisma.TransactionClient,
    account: LedgerAccountRow,
    side: LedgerSide,
    amount: string,
  ) {
    const direction = side === account.normalSide ? 1 : -1;
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE ledger_account_balances
      SET
        balance = balance + (
          ${direction} * CAST(${amount} AS DECIMAL(20, 8))
        ),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (
          ${direction} * CAST(${amount} AS DECIMAL(20, 8))
        ) >= 0
    `);

    if (updated !== 1) {
      throw new ConflictException(
        `Ledger balance update was rejected for ${account.accountKey}.`,
      );
    }
  }

  private entriesBalanced(entries: LedgerEntryRow[]): boolean {
    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);

    for (const entry of entries) {
      const amount = new Prisma.Decimal(entry.amount);
      if (entry.side === 'DEBIT') debits = debits.plus(amount);
      if (entry.side === 'CREDIT') credits = credits.plus(amount);
    }

    return entries.length >= 2 && debits.equals(credits);
  }

  private buildWalletCurrencies(rows: WalletBucketRow[]) {
    const currencies = new Map<
      string,
      Record<UserWalletBucket, Prisma.Decimal>
    >();

    for (const row of rows) {
      const buckets = currencies.get(row.currency) ?? {
        MAIN: new Prisma.Decimal(0),
        PACKAGE_EARNINGS: new Prisma.Decimal(0),
        REFERRAL_COMMISSION: new Prisma.Decimal(0),
        REWARDS: new Prisma.Decimal(0),
      };
      buckets[row.bucket] = new Prisma.Decimal(row.balance);
      currencies.set(row.currency, buckets);
    }

    return Array.from(currencies.entries()).map(([currency, buckets]) => {
      const total = USER_WALLET_BUCKETS.reduce(
        (sum, bucket) => sum.plus(buckets[bucket]),
        new Prisma.Decimal(0),
      );
      return {
        currency,
        buckets: {
          main: this.decimalString(buckets.MAIN),
          packageEarnings: this.decimalString(buckets.PACKAGE_EARNINGS),
          referralCommission: this.decimalString(buckets.REFERRAL_COMMISSION),
          rewards: this.decimalString(buckets.REWARDS),
        },
        totalWallet: this.decimalString(total),
      };
    });
  }

  private transactionSnapshot(row: LedgerTransactionRow) {
    return {
      id: row.id,
      kind: row.kind,
      sourceKey: row.sourceKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      currency: row.currency,
      postedByUserId: row.postedByUserId,
      description: row.description,
      metadata: row.metadata,
      postedAt: row.postedAt,
      createdAt: row.createdAt,
    };
  }

  private entrySnapshot(row: LedgerEntryRow) {
    return {
      id: row.id,
      accountId: row.accountId,
      accountKey: row.accountKey,
      ownerType: row.ownerType,
      ownerUserId: row.ownerUserId,
      bucket: row.bucket,
      currency: row.currency,
      side: row.side,
      amount: this.decimalString(row.amount),
      memo: row.memo,
      createdAt: row.createdAt,
    };
  }

  private decimalString(value: DecimalValue): string {
    const decimal =
      value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
    return decimal.toFixed(8).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, '');
  }

  private countNumber(value: bigint | number | string | undefined): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
    return 0;
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
      }
    }

    throw lastError;
  }
}
