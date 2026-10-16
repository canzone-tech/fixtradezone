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
