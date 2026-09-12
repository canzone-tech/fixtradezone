import { randomUUID } from 'node:crypto';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

type LedgerSide = 'DEBIT' | 'CREDIT';
type DecimalValue = Prisma.Decimal | number | string;

interface TotalWalletBalanceRow {
  balance: DecimalValue;
  eventDelta?: DecimalValue;
}

interface TotalWalletEventRow {
  userId: string;
  currency: string;
  direction: LedgerSide;
  amount: DecimalValue;
  ledgerTransactionId: string | null;
}

export interface TotalWalletEventInput {
  eventKey: string;
  userId: string;
  currency: string;
  direction: LedgerSide;
  amount: string;
  reason: string;
  ledgerTransactionId: string;
  requireAvailable: boolean;
  insufficientMessage?: string;
}

export async function insertTotalWalletEvent(
  transaction: Prisma.TransactionClient,
  input: TotalWalletEventInput,
): Promise<void> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) {
    throw new ServiceUnavailableException(
      'Total Wallet event amount must be positive.',
    );
  }

  if (input.requireAvailable) {
    // Lock the USER row and all currently materialized component balance rows in
    // one read. Every Total-Wallet-only spend uses this helper, so the USER row
    // serializes concurrent payout/package spends. Locking component balances
    // also prevents a concurrent source-ledger update from changing the
    // spendable basis between validation and event insertion.
    //
    // Total Wallet is intentionally not a fifth USER ledger bucket. Its current
    // spendable value is:
    //   MAIN + PACKAGE_EARNINGS + REFERRAL_COMMISSION + REWARDS
    //   + immutable Total-Wallet-only CREDIT/DEBIT event delta.
    const balances = await transaction.$queryRaw<TotalWalletBalanceRow[]>(
      Prisma.sql`
        SELECT
          COALESCE(lb.balance, 0.00000000) AS balance,
          COALESCE((
            SELECT SUM(
              CASE
                WHEN event_rows.direction = 'CREDIT' THEN event_rows.amount
                ELSE -event_rows.amount
              END
            )
            FROM user_total_wallet_events event_rows
            WHERE event_rows.userId = u.id
              AND event_rows.currency = ${input.currency}
          ), 0.00000000) AS eventDelta
        FROM users u
        LEFT JOIN ledger_accounts la
          ON la.ownerType = 'USER'
         AND la.ownerUserId = u.id
         AND la.currency = ${input.currency}
         AND la.bucket IN (
           'MAIN', 'PACKAGE_EARNINGS', 'REFERRAL_COMMISSION', 'REWARDS'
         )
        LEFT JOIN ledger_account_balances lb
          ON lb.accountId = la.id
        WHERE u.id = ${input.userId}
        FOR UPDATE
      `,
    );

    if (balances.length === 0) {
      throw new ServiceUnavailableException(
        'Total Wallet USER accounting identity is unavailable.',
      );
    }

    const sourceBalance = balances.reduce(
      (total, row) => total.plus(new Prisma.Decimal(row.balance)),
      new Prisma.Decimal(0),
    );
    const eventDelta = new Prisma.Decimal(balances[0]?.eventDelta ?? 0);
    const available = sourceBalance.plus(eventDelta);

    if (available.lt(amount)) {
      throw new ConflictException(
        input.insufficientMessage ?? 'Insufficient Total Wallet balance.',
      );
    }
  }

  const inserted = await transaction.$executeRaw(Prisma.sql`
    INSERT IGNORE INTO user_total_wallet_events (
      id, eventKey, userId, currency, direction, amount, reason,
      ledgerTransactionId, createdAt
    ) VALUES (
      ${randomUUID()}, ${input.eventKey}, ${input.userId}, ${input.currency},
      ${input.direction}, ${amount.toFixed(8)}, ${input.reason},
      ${input.ledgerTransactionId}, CURRENT_TIMESTAMP(3)
    )
  `);

  if (inserted === 1) return;

  const rows = await transaction.$queryRaw<TotalWalletEventRow[]>(Prisma.sql`
    SELECT userId, currency, direction, amount, ledgerTransactionId
    FROM user_total_wallet_events
    WHERE eventKey = ${input.eventKey}
    LIMIT 1
    FOR UPDATE
  `);
  const existing = rows[0];

  if (
    !existing ||
    existing.userId !== input.userId ||
    existing.currency !== input.currency ||
    existing.direction !== input.direction ||
    !new Prisma.Decimal(existing.amount).equals(amount) ||
    existing.ledgerTransactionId !== input.ledgerTransactionId
  ) {
    throw new ServiceUnavailableException(
      'Total Wallet event key conflicts with existing accounting.',
    );
  }
}
