import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  PAYOUT_AUDIT_OPERATIONS,
  PAYOUT_LEDGER_KINDS,
  PAYOUT_SYSTEM_BUCKETS,
  payoutFeeRevenueAccountKey,
  payoutReleaseSourceKey,
  payoutReserveAccountKey,
  payoutReserveSourceKey,
  payoutSettlementAccountKey,
  payoutSettlementSourceKey,
  payoutUserAccountKey,
  type PayoutBucket,
} from './payouts.constants';

type DecimalValue = Prisma.Decimal | number | string;
type LedgerSide = 'DEBIT' | 'CREDIT';
type LedgerBucket =
  | PayoutBucket
  | 'PAYOUT_RESERVE'
  | 'PAYOUT_SETTLEMENT'
  | 'PAYOUT_FEE_REVENUE';

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: LedgerBucket;
  currency: string;
  normalSide: LedgerSide;
}

interface LedgerTransactionRow {
  id: string;
  sourceKey: string;
}

interface LedgerEntryRow {
  side: LedgerSide;
  amount: DecimalValue;
}

interface CountRow {
  total: bigint | number | string;
}

export interface PayoutAccountingInput {
  payoutId: string;
  userId: string;
  sourceBucket: PayoutBucket;
  currency: string;
  grossAmount: string;
  netAmount: string;
  feeAmount: string;
}

@Injectable()
export class PayoutAccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async reserveInTransaction(
    transaction: Prisma.TransactionClient,
    input: PayoutAccountingInput,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<string> {
    const sourceKey = payoutReserveSourceKey(input.payoutId);
    const ledgerTransaction = await this.establishTransaction(transaction, {
      kind: PAYOUT_LEDGER_KINDS.RESERVE,
      sourceKey,
      payoutId: input.payoutId,
      currency: input.currency,
      actorUserId: actor.id,
      description: `Payout ${input.payoutId} funds reserved.`,
      metadata: {
        payoutId: input.payoutId,
        userId: input.userId,
        sourceBucket: input.sourceBucket,
        grossAmount: input.grossAmount,
      },
    });

    if (!ledgerTransaction.created) {
      return ledgerTransaction.id;
    }

    const userAccount = await this.getUserAccountForUpdate(
      transaction,
      input.userId,
      input.sourceBucket,
      input.currency,
    );
    const reserveAccount = await this.ensureSystemAccount(
      transaction,
      payoutReserveAccountKey(input.currency),
      PAYOUT_SYSTEM_BUCKETS.RESERVE,
      input.currency,
    );

    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: userAccount.id,
      side: 'DEBIT',
      amount: input.grossAmount,
      memo: `Reserve payout ${input.payoutId} from ${input.sourceBucket}.`,
    });
    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: reserveAccount.id,
      side: 'CREDIT',
      amount: input.grossAmount,
      memo: `Reserve liability for payout ${input.payoutId}.`,
    });

    await this.applyBalance(
      transaction,
      userAccount,
      'DEBIT',
      input.grossAmount,
      'Insufficient available balance in the selected wallet bucket.',
    );
    await this.applyBalance(
      transaction,
      reserveAccount,
      'CREDIT',
      input.grossAmount,
      'Payout reserve accounting failed.',
    );

    await this.assertBalanced(transaction, ledgerTransaction.id);
    await this.audit(transaction, {
      actor,
      context,
      transactionId: ledgerTransaction.id,
      description: 'Payout funds reserved through immutable ledger.',
      operation: PAYOUT_AUDIT_OPERATIONS.RESERVE,
      sourceKey,
      input,
    });

    return ledgerTransaction.id;
  }

  async releaseInTransaction(
    transaction: Prisma.TransactionClient,
    input: PayoutAccountingInput,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<string> {
    const sourceKey = payoutReleaseSourceKey(input.payoutId);
    const ledgerTransaction = await this.establishTransaction(transaction, {
      kind: PAYOUT_LEDGER_KINDS.RELEASE,
      sourceKey,
      payoutId: input.payoutId,
      currency: input.currency,
      actorUserId: actor.id,
      description: `Payout ${input.payoutId} reserved funds released.`,
      metadata: {
        payoutId: input.payoutId,
        userId: input.userId,
        sourceBucket: input.sourceBucket,
        grossAmount: input.grossAmount,
      },
    });

    if (!ledgerTransaction.created) {
      return ledgerTransaction.id;
    }

    const userAccount = await this.getUserAccountForUpdate(
      transaction,
      input.userId,
      input.sourceBucket,
      input.currency,
    );
    const reserveAccount = await this.ensureSystemAccount(
      transaction,
      payoutReserveAccountKey(input.currency),
      PAYOUT_SYSTEM_BUCKETS.RESERVE,
      input.currency,
    );

    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: reserveAccount.id,
      side: 'DEBIT',
      amount: input.grossAmount,
      memo: `Release payout ${input.payoutId} reserve.`,
    });
    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: userAccount.id,
      side: 'CREDIT',
      amount: input.grossAmount,
      memo: `Return rejected payout ${input.payoutId} to ${input.sourceBucket}.`,
    });

    await this.applyBalance(
      transaction,
      reserveAccount,
      'DEBIT',
      input.grossAmount,
      'Payout reserve release was rejected.',
    );
    await this.applyBalance(
      transaction,
      userAccount,
      'CREDIT',
      input.grossAmount,
      'Payout wallet release accounting failed.',
    );

    await this.assertBalanced(transaction, ledgerTransaction.id);
    await this.audit(transaction, {
      actor,
      context,
      transactionId: ledgerTransaction.id,
      description: 'Rejected payout reserve released through immutable ledger.',
      operation: PAYOUT_AUDIT_OPERATIONS.RELEASE,
      sourceKey,
      input,
    });

    return ledgerTransaction.id;
  }

  async settleInTransaction(
    transaction: Prisma.TransactionClient,
    input: PayoutAccountingInput,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ): Promise<string> {
    const sourceKey = payoutSettlementSourceKey(input.payoutId);
    const ledgerTransaction = await this.establishTransaction(transaction, {
      kind: PAYOUT_LEDGER_KINDS.SETTLEMENT,
      sourceKey,
      payoutId: input.payoutId,
      currency: input.currency,
      actorUserId: actor.id,
      description: `Payout ${input.payoutId} settled.`,
      metadata: {
        payoutId: input.payoutId,
        userId: input.userId,
        sourceBucket: input.sourceBucket,
        grossAmount: input.grossAmount,
        netAmount: input.netAmount,
        feeAmount: input.feeAmount,
      },
    });

    if (!ledgerTransaction.created) {
      return ledgerTransaction.id;
    }

    const reserveAccount = await this.ensureSystemAccount(
      transaction,
      payoutReserveAccountKey(input.currency),
      PAYOUT_SYSTEM_BUCKETS.RESERVE,
      input.currency,
    );
    const settlementAccount = await this.ensureSystemAccount(
      transaction,
      payoutSettlementAccountKey(input.currency),
      PAYOUT_SYSTEM_BUCKETS.SETTLEMENT,
      input.currency,
    );

    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: reserveAccount.id,
      side: 'DEBIT',
      amount: input.grossAmount,
      memo: `Consume payout ${input.payoutId} reserve.`,
    });
    await this.insertEntry(transaction, {
      transactionId: ledgerTransaction.id,
      accountId: settlementAccount.id,
      side: 'CREDIT',
      amount: input.netAmount,
      memo: `External settlement amount for payout ${input.payoutId}.`,
    });

    await this.applyBalance(
      transaction,
      reserveAccount,
      'DEBIT',
      input.grossAmount,
      'Payout settlement reserve was unavailable.',
    );
    await this.applyBalance(
      transaction,
      settlementAccount,
      'CREDIT',
      input.netAmount,
      'Payout settlement accounting failed.',
    );

    if (new Prisma.Decimal(input.feeAmount).gt(0)) {
      const feeAccount = await this.ensureSystemAccount(
        transaction,
        payoutFeeRevenueAccountKey(input.currency),
        PAYOUT_SYSTEM_BUCKETS.FEE_REVENUE,
        input.currency,
      );

      await this.insertEntry(transaction, {
        transactionId: ledgerTransaction.id,
        accountId: feeAccount.id,
        side: 'CREDIT',
        amount: input.feeAmount,
        memo: `Payout ${input.payoutId} fee revenue.`,
      });
      await this.applyBalance(
        transaction,
        feeAccount,
        'CREDIT',
        input.feeAmount,
        'Payout fee accounting failed.',
      );
    }

    await this.assertBalanced(transaction, ledgerTransaction.id);
    await this.audit(transaction, {
      actor,
      context,
      transactionId: ledgerTransaction.id,
      description: 'Completed payout settled through immutable ledger.',
      operation: PAYOUT_AUDIT_OPERATIONS.SETTLE,
      sourceKey,
      input,
    });

    return ledgerTransaction.id;
  }

  private async establishTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      kind: string;
      sourceKey: string;
      payoutId: string;
      currency: string;
      actorUserId: string;
      description: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ id: string; created: boolean }> {
    const proposedId = randomUUID();

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_transactions (
        id, kind, sourceKey, sourceType, sourceId, currency,
        postedByUserId, description, metadata, postedAt, createdAt
      ) VALUES (
        ${proposedId}, ${input.kind}, ${input.sourceKey}, 'PAYOUT',
        ${input.payoutId}, ${input.currency}, ${input.actorUserId},
        ${input.description}, ${JSON.stringify(input.metadata)},
        CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE sourceKey = VALUES(sourceKey)
    `);

    const rows = await transaction.$queryRaw<LedgerTransactionRow[]>(
      Prisma.sql`
        SELECT id, sourceKey
        FROM ledger_transactions
        WHERE sourceKey = ${input.sourceKey}
        LIMIT 1
        FOR UPDATE
      `,
    );
    const ledgerTransaction = rows[0];

    if (!ledgerTransaction) {
      throw new ServiceUnavailableException(
        'Payout accounting transaction could not be established.',
      );
    }

    const counts = await transaction.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM ledger_entries
      WHERE transactionId = ${ledgerTransaction.id}
    `);

    return {
      id: ledgerTransaction.id,
      created: this.countNumber(counts[0]?.total) === 0,
    };
  }

  private async getUserAccountForUpdate(
    transaction: Prisma.TransactionClient,
    userId: string,
    bucket: PayoutBucket,
    currency: string,
  ): Promise<LedgerAccountRow> {
    const accountKey = payoutUserAccountKey(userId, bucket, currency);
    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
      FROM ledger_accounts
      WHERE accountKey = ${accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];

    if (!account) {
      throw new ConflictException(
        'Selected wallet bucket has no available balance.',
      );
    }

    if (
      account.ownerType !== 'USER' ||
      account.ownerUserId !== userId ||
      account.bucket !== bucket ||
      account.currency !== currency ||
      account.normalSide !== 'CREDIT'
    ) {
      throw new ServiceUnavailableException(
        'Wallet account semantics conflict with payout requirements.',
      );
    }

    return account;
  }

  private async ensureSystemAccount(
    transaction: Prisma.TransactionClient,
    accountKey: string,
    bucket: LedgerBucket,
    currency: string,
  ): Promise<LedgerAccountRow> {
    const proposedId = randomUUID();

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id, accountKey, ownerType, ownerUserId, bucket,
        currency, normalSide, createdAt
      ) VALUES (
        ${proposedId}, ${accountKey}, 'SYSTEM', NULL, ${bucket},
        ${currency}, 'CREDIT', CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);

    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
      FROM ledger_accounts
      WHERE accountKey = ${accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];

    if (!account) {
      throw new ServiceUnavailableException(
        'Payout system ledger account could not be established.',
      );
    }

    if (
      account.ownerType !== 'SYSTEM' ||
      account.ownerUserId !== null ||
      account.bucket !== bucket ||
      account.currency !== currency ||
      account.normalSide !== 'CREDIT'
    ) {
      throw new ServiceUnavailableException(
        'Payout system account key conflicts with existing semantics.',
      );
    }

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_account_balances (accountId, balance, revision, updatedAt)
      VALUES (${account.id}, 0.00000000, 0, CURRENT_TIMESTAMP(3))
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
  ): Promise<void> {
    if (new Prisma.Decimal(input.amount).lte(0)) {
      throw new ServiceUnavailableException(
        'Payout ledger entry amount must be positive.',
      );
    }

    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id, transactionId, accountId, side, amount, memo, createdAt
      ) VALUES (
        ${randomUUID()}, ${input.transactionId}, ${input.accountId},
        ${input.side}, ${input.amount}, ${input.memo}, CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async applyBalance(
    transaction: Prisma.TransactionClient,
    account: LedgerAccountRow,
    side: LedgerSide,
    amount: string,
    rejectionMessage: string,
  ): Promise<void> {
    const direction = side === account.normalSide ? 1 : -1;
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE ledger_account_balances
      SET
        balance = balance + (${direction} * CAST(${amount} AS DECIMAL(20, 8))),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (${direction} * CAST(${amount} AS DECIMAL(20, 8))) >= 0
    `);

    if (updated !== 1) {
      throw new ConflictException(rejectionMessage);
    }
  }

  private async assertBalanced(
    transaction: Prisma.TransactionClient,
    transactionId: string,
  ): Promise<void> {
    const entries = await transaction.$queryRaw<LedgerEntryRow[]>(Prisma.sql`
      SELECT side, amount
      FROM ledger_entries
      WHERE transactionId = ${transactionId}
      ORDER BY createdAt ASC, id ASC
    `);

    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);

    for (const entry of entries) {
      const amount = new Prisma.Decimal(entry.amount);
      if (entry.side === 'DEBIT') debits = debits.plus(amount);
      if (entry.side === 'CREDIT') credits = credits.plus(amount);
    }

    if (entries.length < 2 || !debits.equals(credits)) {
      throw new ServiceUnavailableException(
        'Payout ledger transaction is not balanced.',
      );
    }
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    input: {
      actor: AuthenticatedUser;
      context: RequestContext;
      transactionId: string;
      description: string;
      operation: string;
      sourceKey: string;
      input: PayoutAccountingInput;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorUserId: input.actor.id,
        action: 'CREATE',
        entityType: 'LedgerTransaction',
        entityId: input.transactionId,
        description: input.description,
        metadata: {
          source: 'PAYOUT_ACCOUNTING',
          operation: input.operation,
          sourceKey: input.sourceKey,
          payoutId: input.input.payoutId,
          userId: input.input.userId,
          sourceBucket: input.input.sourceBucket,
          grossAmount: input.input.grossAmount,
          netAmount: input.input.netAmount,
          feeAmount: input.input.feeAmount,
          currency: input.input.currency,
          balanced: true,
        },
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
      },
    });
  }

  private countNumber(
    value: bigint | number | string | undefined,
  ): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number.parseInt(value, 10) || 0;
    return 0;
  }
}
