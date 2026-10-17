import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';

export interface TradeResultNotificationInput {
  userId: string;
  eventId: string;
  assetSymbol: string;
  outcome: 'WIN' | 'LOSS';
  slotNumber: number;
}

/**
 * Persist the user's WIN/LOSS alert in the SAME transaction as the canonical
 * Internal Trading event. Rolled-back trades cannot leave phantom alerts;
 * existing trades do not cause replay alerts when reconciliation is retried.
 * A future Web Push dispatcher may deliver this immutable inbox event.
 */
export async function recordTradeResultNotification(
  transaction: Prisma.TransactionClient,
  input: TradeResultNotificationInput,
): Promise<void> {
  const title = `Daily Trade ${input.outcome} — ${input.assetSymbol}`;
  const message =
    `Your algorithm-generated ${input.assetSymbol} Daily Trade #${input.slotNumber} ` +
    `completed with a ${input.outcome === 'WIN' ? 'positive' : 'negative'} result. ` +
    'View Daily Trade History.';

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO user_notifications (
      id, userId, category, title, message, sourceType, sourceId,
      createdByUserId, readAt, createdAt, updatedAt
    ) VALUES (
      ${randomUUID()}, ${input.userId}, 'FINANCE', ${title}, ${message},
      'INTERNAL_TRADE_EVENT', ${input.eventId}, NULL, NULL,
      CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    )
  `);
}

/**
 * A Claim Profit Ready alert is emitted only when the new claim's ID exists.
 * Inserting a duplicate (subscription, date) with ON DUPLICATE KEY UPDATE
 * retains the original claim ID, so replay cannot create another alert.
 * The notification and its claim always commit/roll back together.
 */
export async function recordClaimProfitReadyNotification(
  transaction: Prisma.TransactionClient,
  input: { userId: string; claimId: string; localTradeDate: string },
): Promise<void> {
  const title = 'Claim Profit Ready — Daily Trade';
  const message =
    `Your V2 algorithm-generated Daily Trades for ${input.localTradeDate} are complete (5/5). ` +
    'Claim Profit is now available on the Trading page.';

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO user_notifications (
      id, userId, category, title, message, sourceType, sourceId,
      createdByUserId, readAt, createdAt, updatedAt
    )
    SELECT ${randomUUID()}, c.userId, 'FINANCE', ${title}, ${message},
      'INTERNAL_TRADE_DAILY_CLAIM_READY', c.id, NULL, NULL,
      CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    FROM internal_trade_daily_claims c
    WHERE c.id = ${input.claimId}
      AND c.userId = ${input.userId}
      AND c.status = 'PENDING'
  `);
}

/** Sent only after the claim and its balanced ledger posting have succeeded. */
export async function recordClaimProfitCompletedNotification(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    claimId: string;
    localTradeDate: string;
    userAmount: string;
    currency: string;
  },
): Promise<void> {
  const title = 'Claim Profit Successful — Daily Trade';
  const message =
    `Your V2 Daily Trade profit for ${input.localTradeDate} was claimed successfully. ` +
    `${input.userAmount} ${input.currency} was credited to Package Earnings. View Trading History.`;

  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO user_notifications (
      id, userId, category, title, message, sourceType, sourceId,
      createdByUserId, readAt, createdAt, updatedAt
    )
    SELECT ${randomUUID()}, c.userId, 'FINANCE', ${title}, ${message},
      'INTERNAL_TRADE_DAILY_CLAIMED', c.id, NULL, NULL,
      CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    FROM internal_trade_daily_claims c
    WHERE c.id = ${input.claimId}
      AND c.userId = ${input.userId}
      AND c.status = 'CLAIMED'
  `);
}
