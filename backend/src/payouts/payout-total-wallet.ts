import { Prisma } from '../generated/prisma/client';
import {
  PAYOUT_TOTAL_WALLET_DRAW_ORDER,
  type PayoutWalletBucket,
} from './payouts.constants';

export interface TotalWalletBalance {
  bucket: PayoutWalletBucket;
  balance: string;
}

export interface TotalWalletAllocation {
  bucket: PayoutWalletBucket;
  amount: string;
}

export function allocateTotalWallet(
  balances: readonly TotalWalletBalance[],
  requestedAmount: string,
): TotalWalletAllocation[] | null {
  const requested = new Prisma.Decimal(requestedAmount);

  if (requested.lte(0)) {
    return null;
  }

  const availableByBucket = new Map<PayoutWalletBucket, Prisma.Decimal>();
  for (const item of balances) {
    const balance = new Prisma.Decimal(item.balance);
    availableByBucket.set(
      item.bucket,
      balance.gt(0) ? balance : new Prisma.Decimal(0),
    );
  }

  let remaining = requested;
  const allocations: TotalWalletAllocation[] = [];

  for (const bucket of PAYOUT_TOTAL_WALLET_DRAW_ORDER) {
    if (remaining.lte(0)) break;

    const available = availableByBucket.get(bucket) ?? new Prisma.Decimal(0);
    if (available.lte(0)) continue;

    const amount = available.gte(remaining) ? remaining : available;
    allocations.push({
      bucket,
      amount: amount.toFixed(8),
    });
    remaining = remaining.minus(amount);
  }

  return remaining.eq(0) ? allocations : null;
}
