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
import {
  packagePrincipalAccountKey,
  userWalletAccountKey,
} from '../wallet/wallet.constants';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

interface PendingCompletionRow {
  subscriptionId: string;
}

interface CompletionStateRow {
  subscriptionId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'BLOCKED';
  completionReason: 'TARGET_REACHED_AT_DURATION_END' | null;
  principalAmount: Prisma.Decimal | string | number;
  completedAt: Date | null;
}

interface SubscriptionCompletionRow {
  id: string;
  userId: string;
  packageCode: string;
  packageDisplayName: string;
  price: Prisma.Decimal | string | number;
  currency: string;
  principalTreatment: string;
  durationDays: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED' | 'CANCELLED';
  completedAt: Date | null;
}

interface LedgerTransactionRow {
  id: string;
  kind: string;
  sourceKey: string;
  sourceType: string;
  sourceId: string;
  currency: string;
}

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: string;
  currency: string;
  normalSide: 'DEBIT' | 'CREDIT';
}

interface ReturnEntryRow {
  side: 'DEBIT' | 'CREDIT';
  amount: Prisma.Decimal | string | number;
  accountKey: string;
}

@Injectable()
export class InternalTradingPackageCompletionService {
  constructor(private readonly prisma: PrismaService) {}

  async listPendingCompletions(limit = 100) {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const rows = await this.prisma.$queryRaw<PendingCompletionRow[]>(Prisma.sql`
      SELECT s.subscriptionId
      FROM internal_trade_subscription_states s
      INNER JOIN user_package_subscriptions ups
        ON ups.id = s.subscriptionId
      WHERE s.status = 'COMPLETED'
        AND s.completionReason = 'TARGET_REACHED_AT_DURATION_END'
        AND ups.status = 'ACTIVE'
      ORDER BY s.completedAt ASC, s.subscriptionId ASC
      LIMIT ${safeLimit}
    `);

    return rows.map((row) => row.subscriptionId);
  }

  async finalizeCompletion(
    subscriptionId: string,
    actor: AuthenticatedUser | null,
    context: RequestContext = {},
  ) {
    return this.runSerializable(async (transaction) => {
      const subscriptionRows = await transaction.$queryRaw<
        SubscriptionCompletionRow[]
      >(Prisma.sql`
        SELECT
          id,
          userId,
          packageCode,
          packageDisplayName,
          price,
          currency,
          principalTreatment,
          durationDays,
          status,
          completedAt
        FROM user_package_subscriptions
        WHERE id = ${subscriptionId}
        LIMIT 1
        FOR UPDATE
      `);
      const subscription = subscriptionRows[0];

      if (!subscription) {
        throw new NotFoundException('Package subscription was not found.');
      }

      const stateRows = await transaction.$queryRaw<CompletionStateRow[]>(
        Prisma.sql`
          SELECT
            subscriptionId,
            status,
            completionReason,
            principalAmount,
            completedAt
          FROM internal_trade_subscription_states
          WHERE subscriptionId = ${subscriptionId}
          LIMIT 1
          FOR UPDATE
        `,
      );
      const state = stateRows[0];

      if (!state) {
        throw new ConflictException(
          'Internal trading lifecycle state is unavailable for package completion.',
        );
      }

      if (
        state.status !== 'COMPLETED' ||
        state.completionReason !== 'TARGET_REACHED_AT_DURATION_END' ||
        !state.completedAt
      ) {
        return {
          finalized: false,
          principalReturnApplied: false,
          principalReturnTransactionId: null,
          message: 'Package trading lifecycle is not complete yet.',
        };
      }

      const principal = new Prisma.Decimal(subscription.price);
      const statePrincipal = new Prisma.Decimal(state.principalAmount);
      if (!principal.eq(statePrincipal) || principal.lte(0)) {
        throw new ServiceUnavailableException(
          'Package principal does not match the completed internal trading lifecycle.',
        );
      }

      const currency = subscription.currency.toUpperCase();
      const amount = principal.toFixed(8);
      const sourceKey = this.principalReturnSourceKey(subscription.id);
      let principalReturnTransactionId: string | null = null;
      let principalReturnApplied = false;

      if (subscription.principalTreatment === 'RETURN_SEPARATELY') {
        const existingReturn = await this.findReturnTransaction(
          transaction,
          sourceKey,
          true,
        );

        if (existingReturn) {
          await this.assertExistingReturn(
            transaction,
            existingReturn,
            subscription,
            amount,
          );
          principalReturnTransactionId = existingReturn.id;
        } else {
          if (subscription.status === 'COMPLETED') {
            throw new ServiceUnavailableException(
              'Completed returnable package is missing its principal-return ledger transaction.',
            );
          }

          const principalAccount = await this.requireAccount(
            transaction,
            packagePrincipalAccountKey(currency),
            'SYSTEM',
            null,
            'PACKAGE_PRINCIPAL',
            currency,
            'CREDIT',
          );
          const userMainAccount = await this.requireAccount(
            transaction,
            userWalletAccountKey(subscription.userId, 'MAIN', currency),
            'USER',
            subscription.userId,
            'MAIN',
            currency,
            'CREDIT',
          );

          principalReturnTransactionId = randomUUID();
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
              ${principalReturnTransactionId},
              'PACKAGE_PRINCIPAL_RETURN',
              ${sourceKey},
              'PACKAGE_SUBSCRIPTION',
              ${subscription.id},
              ${currency},
              ${actor?.id ?? null},
              ${`Return exact invested principal for completed package ${subscription.packageDisplayName}.`},
              ${JSON.stringify({
                subscriptionId: subscription.id,
                userId: subscription.userId,
                packageCode: subscription.packageCode,
                packageDisplayName: subscription.packageDisplayName,
                amount,
                currency,
                principalTreatment: subscription.principalTreatment,
                durationDays: subscription.durationDays,
                completionReason: state.completionReason,
                internalTradingCompletedAt: state.completedAt.toISOString(),
              })},
              CURRENT_TIMESTAMP(3),
              CURRENT_TIMESTAMP(3)
            )
          `);

          await this.insertEntry(
            transaction,
            principalReturnTransactionId,
            principalAccount.id,
            'DEBIT',
            amount,
            `Release completed package principal for ${subscription.id}.`,
          );
          await this.insertEntry(
            transaction,
            principalReturnTransactionId,
            userMainAccount.id,
            'CREDIT',
            amount,
            `Return completed package principal to USER Main for ${subscription.id}.`,
          );

          await this.assertBalancedReturn(
            transaction,
            principalReturnTransactionId,
            principalAccount.accountKey,
            userMainAccount.accountKey,
            amount,
          );
          await this.applyBalance(
            transaction,
            principalAccount,
            'DEBIT',
            amount,
          );
          await this.applyBalance(
            transaction,
            userMainAccount,
            'CREDIT',
            amount,
          );

          principalReturnApplied = true;

          await transaction.auditLog.create({
            data: {
              actorUserId: actor?.id ?? null,
              action: 'CREATE',
              entityType: 'LedgerTransaction',
              entityId: principalReturnTransactionId,
              description:
                'Exact invested package principal returned after completed internal trading lifecycle.',
              metadata: {
                source: 'PACKAGE_LIFECYCLE',
                operation: 'RETURN_PACKAGE_PRINCIPAL',
                subscriptionId: subscription.id,
                userId: subscription.userId,
                packageCode: subscription.packageCode,
                amount,
                currency,
                debitAccount: principalAccount.accountKey,
                creditAccount: userMainAccount.accountKey,
                principalTreatment: subscription.principalTreatment,
                completionReason: state.completionReason,
                balanced: true,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
        }
      }

      if (subscription.status === 'COMPLETED') {
        return {
          finalized: true,
          principalReturnApplied: false,
          principalReturnTransactionId,
          message: 'Package completion is already finalized.',
        };
      }

      if (subscription.status !== 'ACTIVE') {
        throw new ConflictException(
          `Package completion cannot finalize subscription status ${subscription.status}.`,
        );
      }

      const completed = await transaction.$executeRaw(Prisma.sql`
        UPDATE user_package_subscriptions
        SET
          status = 'COMPLETED',
          completedAt = ${state.completedAt},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${subscription.id}
          AND status = 'ACTIVE'
      `);

      if (completed !== 1) {
        throw new ConflictException(
          'Package subscription changed while completion was being finalized.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor?.id ?? null,
          action: 'UPDATE',
          entityType: 'UserPackageSubscription',
          entityId: subscription.id,
          description:
            'Package subscription completed after its internal trading duration ended.',
          metadata: {
            source: 'PACKAGE_LIFECYCLE',
            operation: 'FINALIZE_PACKAGE_COMPLETION',
            subscriptionId: subscription.id,
            userId: subscription.userId,
            packageCode: subscription.packageCode,
            packageDisplayName: subscription.packageDisplayName,
            amount,
            currency,
            durationDays: subscription.durationDays,
            principalTreatment: subscription.principalTreatment,
            principalReturnApplied,
            principalReturnTransactionId,
            completionReason: state.completionReason,
            completedAt: state.completedAt.toISOString(),
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        finalized: true,
        principalReturnApplied,
        principalReturnTransactionId,
        message:
          subscription.principalTreatment === 'RETURN_SEPARATELY'
            ? 'Package completed and exact invested principal returned to USER Main.'
            : subscription.principalTreatment === 'NON_REFUNDABLE_PACKAGE_VALUE'
              ? 'Package completed. No capital return applies to this package.'
              : 'Package completed under legacy principal treatment.',
      };
    });
  }

  private principalReturnSourceKey(subscriptionId: string) {
    return `SUBSCRIPTION:${subscriptionId}:PRINCIPAL_RETURN`;
  }

  private async findReturnTransaction(
    transaction: Prisma.TransactionClient,
    sourceKey: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;
    const rows = await transaction.$queryRaw<LedgerTransactionRow[]>(Prisma.sql`
      SELECT id, kind, sourceKey, sourceType, sourceId, currency
      FROM ledger_transactions
      WHERE sourceKey = ${sourceKey}
      LIMIT 1
      ${lock}
    `);
    return rows[0] ?? null;
  }

  private async assertExistingReturn(
    transaction: Prisma.TransactionClient,
    ledgerTransaction: LedgerTransactionRow,
    subscription: SubscriptionCompletionRow,
    amount: string,
  ) {
    if (
      ledgerTransaction.kind !== 'PACKAGE_PRINCIPAL_RETURN' ||
      ledgerTransaction.sourceType !== 'PACKAGE_SUBSCRIPTION' ||
      ledgerTransaction.sourceId !== subscription.id ||
      ledgerTransaction.currency !== subscription.currency.toUpperCase()
    ) {
      throw new ServiceUnavailableException(
        'Package principal-return source key conflicts with another ledger transaction.',
      );
    }

    await this.assertBalancedReturn(
      transaction,
      ledgerTransaction.id,
      packagePrincipalAccountKey(subscription.currency.toUpperCase()),
      userWalletAccountKey(
        subscription.userId,
        'MAIN',
        subscription.currency.toUpperCase(),
      ),
      amount,
    );
  }

  private async requireAccount(
    transaction: Prisma.TransactionClient,
    accountKey: string,
    ownerType: 'SYSTEM' | 'USER',
    ownerUserId: string | null,
    bucket: string,
    currency: string,
    normalSide: 'DEBIT' | 'CREDIT',
  ) {
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
        `Required package completion ledger account ${accountKey} does not exist.`,
      );
    }

    if (
      account.ownerType !== ownerType ||
      account.ownerUserId !== ownerUserId ||
      account.bucket !== bucket ||
      account.currency !== currency ||
      account.normalSide !== normalSide
    ) {
      throw new ServiceUnavailableException(
        `Package completion ledger account ${accountKey} has inconsistent semantics.`,
      );
    }

    return account;
  }

  private async insertEntry(
    transaction: Prisma.TransactionClient,
    transactionId: string,
    accountId: string,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
    memo: string,
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
        ${transactionId},
        ${accountId},
        ${side},
        ${amount},
        ${memo},
        CURRENT_TIMESTAMP(3)
      )
    `);
  }

  private async assertBalancedReturn(
    transaction: Prisma.TransactionClient,
    transactionId: string,
    principalAccountKey: string,
    userMainAccountKey: string,
    amount: string,
  ) {
    const rows = await transaction.$queryRaw<ReturnEntryRow[]>(Prisma.sql`
      SELECT le.side, le.amount, la.accountKey
      FROM ledger_entries le
      INNER JOIN ledger_accounts la ON la.id = le.accountId
      WHERE le.transactionId = ${transactionId}
      ORDER BY le.createdAt ASC, le.id ASC
    `);

    if (rows.length !== 2) {
      throw new ServiceUnavailableException(
        'Package principal-return transaction must contain exactly two ledger entries.',
      );
    }

    const debit = rows.find(
      (row) => row.side === 'DEBIT' && row.accountKey === principalAccountKey,
    );
    const credit = rows.find(
      (row) => row.side === 'CREDIT' && row.accountKey === userMainAccountKey,
    );

    if (
      !debit ||
      !credit ||
      !new Prisma.Decimal(debit.amount).eq(amount) ||
      !new Prisma.Decimal(credit.amount).eq(amount)
    ) {
      throw new ServiceUnavailableException(
        'Package principal-return ledger entries do not match the exact invested principal.',
      );
    }
  }

  private async applyBalance(
    transaction: Prisma.TransactionClient,
    account: LedgerAccountRow,
    side: 'DEBIT' | 'CREDIT',
    amount: string,
  ) {
    const direction = side === account.normalSide ? 1 : -1;
    const updated = await transaction.$executeRaw(Prisma.sql`
      UPDATE ledger_account_balances
      SET
        balance = balance + (${direction} * CAST(${amount} AS DECIMAL(20,8))),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (${direction} * CAST(${amount} AS DECIMAL(20,8))) >= 0
    `);

    if (updated !== 1) {
      throw new ConflictException(
        `Ledger balance update rejected for ${account.accountKey}.`,
      );
    }
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
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
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
      }
    }
    throw lastError;
  }
}
