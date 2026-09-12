import { randomUUID } from 'node:crypto';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

type LedgerSide = 'DEBIT' | 'CREDIT';
type DecimalValue = Prisma.Decimal | number | string;

interface TotalWalletBalanceRow {
  balance: DecimalValue;
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
    const balances = await transaction.$queryRaw<TotalWalletBalanceRow[]>(
      Prisma.sql`
        SELECT balance
        FROM user_total_wallet_balances
        WHERE userId = ${input.userId}
          AND currency = ${input.currency}
        LIMIT 1
        FOR UPDATE
      `,
    );
    const available = balances[0]
      ? new Prisma.Decimal(balances[0].balance)
      : new Prisma.Decimal(0);

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
