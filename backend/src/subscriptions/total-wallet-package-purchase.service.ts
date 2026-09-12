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
import { insertTotalWalletEvent } from '../wallet/total-wallet-accounting';
import {
  packagePrincipalAccountKey,
  totalWalletControlAccountKey,
} from '../wallet/wallet.constants';
import type { PurchasePackageFromTotalWalletDto } from './dto/subscription.dto';
import { SubscriptionPostActivationService } from './subscription-post-activation.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

type DecimalValue = Prisma.Decimal | number | string;
type LedgerSide = 'DEBIT' | 'CREDIT';

interface CountRow {
  total: bigint | number | string;
}

interface PackagePurchaseRow {
  packagePlanItemId: string;
  packagePlanVersionId: string;
  packageDefinitionId: string;
  packageCode: string;
  packageDisplayName: string;
  availability: 'AVAILABLE' | 'HIDDEN' | 'CLOSED_TO_NEW_ACTIVATIONS';
  price: DecimalValue;
  minimumInvestment: DecimalValue | null;
  maximumInvestment: DecimalValue | null;
  durationDays: number | null;
  currency: string;
  activePackageMode: 'SINGLE_ACTIVE' | 'MULTIPLE_ACTIVE';
  multipleActivePackageBasis: string;
  activationTrigger: string;
  renewalMode: string;
  upgradesEnabled: boolean | number;
  planStatus: 'DRAFT' | 'PUBLISHED';
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  rewardRateMode: string;
  fixedRewardRate: DecimalValue | null;
  minimumRewardRate: DecimalValue | null;
  maximumRewardRate: DecimalValue | null;
  rewardRateMeaning: string;
  capBasis: string;
  capMultiplier: DecimalValue;
  principalTreatment: string;
  goalDays: number;
  cycleDays: number;
  rewardStartMode: string;
  rewardFrequency: string;
  cycleDayMode: string;
  rewardDayMode: string;
  cycleEndAction: string;
  capReachedAction: string;
}

interface ExistingPurchaseRow {
  id: string;
  packagePlanItemId: string;
  price: DecimalValue;
  fundingSource: 'DEPOSIT' | 'TOTAL_WALLET';
  fundingLedgerTransactionId: string;
}

interface OperationsConfigRow {
  platformTimezone: string;
}

interface EffectiveInternalTradePolicyRow {
  id: string;
  userSharePercent: DecimalValue;
  adminSharePercent: DecimalValue;
}

interface LedgerTransactionRow {
  id: string;
  sourceKey: string;
}

interface LedgerAccountRow {
  id: string;
  accountKey: string;
  ownerType: 'SYSTEM' | 'USER';
  ownerUserId: string | null;
  bucket: 'PAYOUT_TOTAL_WALLET_CONTROL' | 'PACKAGE_PRINCIPAL';
  currency: string;
  normalSide: LedgerSide;
}

interface LedgerEntryRow {
  side: LedgerSide;
  amount: DecimalValue;
}

@Injectable()
export class TotalWalletPackagePurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postActivationService: SubscriptionPostActivationService,
  ) {}

  async purchase(
    dto: PurchasePackageFromTotalWalletDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const activation = await this.runSerializable(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT id
        FROM users
        WHERE id = ${actor.id}
        LIMIT 1
        FOR UPDATE
      `);

      const requestedAmount = new Prisma.Decimal(dto.amount).toFixed(8);
      if (new Prisma.Decimal(requestedAmount).lte(0)) {
        throw new ConflictException(
          'Reinvestment amount must be positive.',
        );
      }

      const existingRows = await transaction.$queryRaw<ExistingPurchaseRow[]>(
        Prisma.sql`
          SELECT
            id,
            packagePlanItemId,
            price,
            fundingSource,
            fundingLedgerTransactionId
          FROM user_package_subscriptions
          WHERE userId = ${actor.id}
            AND purchaseRequestKey = ${dto.requestKey}
          LIMIT 1
          FOR UPDATE
        `,
      );
      const existing = existingRows[0];
      if (existing) {
        if (
          existing.fundingSource !== 'TOTAL_WALLET' ||
          existing.packagePlanItemId !== dto.packagePlanItemId ||
          !new Prisma.Decimal(existing.price).equals(requestedAmount)
        ) {
          throw new ConflictException(
            'The reinvestment request key was already used with different request data.',
          );
        }

        return {
          created: false,
          subscriptionId: existing.id,
          fundingLedgerTransactionId: existing.fundingLedgerTransactionId,
          amount: requestedAmount,
          currency: 'USDT',
        };
      }

      const now = new Date();
      const packageRows = await transaction.$queryRaw<PackagePurchaseRow[]>(
        Prisma.sql`
          SELECT
            ppi.id AS packagePlanItemId,
            ppi.planVersionId AS packagePlanVersionId,
            ppi.packageDefinitionId,
            pd.code AS packageCode,
            ppi.displayName AS packageDisplayName,
            ppi.availability,
            ppi.price,
            ppi.minimumInvestment,
            ppi.maximumInvestment,
            ppi.durationDays,
            ppi.currency,
            ppv.activePackageMode,
            ppv.multipleActivePackageBasis,
            ppv.activationTrigger,
            ppv.renewalMode,
            ppv.upgradesEnabled,
            ppv.status AS planStatus,
            ppv.effectiveFrom,
            ppv.effectiveTo,
            ppi.rewardRateMode,
            ppi.fixedRewardRate,
            ppi.minimumRewardRate,
            ppi.maximumRewardRate,
            ppi.rewardRateMeaning,
            ppi.capBasis,
            ppi.capMultiplier,
            ppi.principalTreatment,
            ppi.goalDays,
            ppi.cycleDays,
            ppi.rewardStartMode,
            ppi.rewardFrequency,
            ppi.cycleDayMode,
            ppi.rewardDayMode,
            ppi.cycleEndAction,
            ppi.capReachedAction
          FROM package_plan_items ppi
          INNER JOIN package_plan_versions ppv ON ppv.id = ppi.planVersionId
          INNER JOIN package_definitions pd ON pd.id = ppi.packageDefinitionId
          WHERE ppi.id = ${dto.packagePlanItemId}
          LIMIT 1
          FOR UPDATE
        `,
      );
      const packageItem = packageRows[0];
      if (!packageItem) {
        throw new NotFoundException('Package is not available.');
      }
      if (
        packageItem.planStatus !== 'PUBLISHED' ||
        packageItem.effectiveFrom === null ||
        packageItem.effectiveFrom > now ||
        (packageItem.effectiveTo !== null && packageItem.effectiveTo <= now)
      ) {
        throw new ConflictException(
          'Package is outside the effective published catalogue.',
        );
      }
      if (packageItem.availability !== 'AVAILABLE') {
        throw new ConflictException(
          'Package is closed to new purchases under the current plan.',
        );
      }
      if (
        packageItem.activationTrigger !== 'PAYMENT_APPROVED' &&
        packageItem.activationTrigger !== 'MANUAL_ACTIVATION'
      ) {
        throw new ConflictException(
          `Package activation trigger ${packageItem.activationTrigger} requires its dedicated activation engine.`,
        );
      }

      const amount = new Prisma.Decimal(requestedAmount);
      const rangeConfigured = packageItem.minimumInvestment !== null;
      let minimumInvestment: string | null = null;
      let maximumInvestment: string | null = null;
      let durationDays = packageItem.goalDays;

      if (rangeConfigured) {
        if (
          packageItem.minimumInvestment === null ||
          packageItem.durationDays === null
        ) {
          throw new ServiceUnavailableException(
            'Package range configuration is incomplete.',
          );
        }
        const minimum = new Prisma.Decimal(packageItem.minimumInvestment);
        if (amount.lt(minimum)) {
          throw new ConflictException(
            'Reinvestment amount is below the configured package minimum.',
          );
        }
        if (
          packageItem.maximumInvestment !== null &&
          amount.gt(new Prisma.Decimal(packageItem.maximumInvestment))
        ) {
          throw new ConflictException(
            'Reinvestment amount exceeds the configured package maximum.',
          );
        }
        minimumInvestment = minimum.toFixed(8);
        maximumInvestment =
          packageItem.maximumInvestment === null
            ? null
            : new Prisma.Decimal(packageItem.maximumInvestment).toFixed(8);
        durationDays = packageItem.durationDays;
      } else if (!amount.equals(new Prisma.Decimal(packageItem.price))) {
        throw new ConflictException(
          'Reinvestment amount must match the configured package price.',
        );
      }

      const duplicateActiveRows = await transaction.$queryRaw<
        Array<{ id: string }>
      >(Prisma.sql`
        SELECT id
        FROM user_package_subscriptions
        WHERE userId = ${actor.id}
          AND packageDefinitionId = ${packageItem.packageDefinitionId}
          AND status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE
      `);
      if (duplicateActiveRows.length > 0) {
        throw new ConflictException('This package is already active.');
      }

      if (packageItem.activePackageMode === 'SINGLE_ACTIVE') {
        const activeRows = await transaction.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id
            FROM user_package_subscriptions
            WHERE userId = ${actor.id}
              AND status = 'ACTIVE'
            LIMIT 1
            FOR UPDATE
          `,
        );
        if (activeRows.length > 0) {
          throw new ConflictException(
            'This package plan allows only one active package for the USER.',
          );
        }
      }

      const operationsRows = await transaction.$queryRaw<OperationsConfigRow[]>(
        Prisma.sql`
          SELECT platformTimezone
          FROM system_operations_config
          WHERE id = 1
          LIMIT 1
          FOR SHARE
        `,
      );
      const platformTimezone = operationsRows[0]?.platformTimezone?.trim();
      if (!platformTimezone) {
        throw new ServiceUnavailableException(
          'Platform operations configuration is unavailable.',
        );
      }

      const internalTradePolicyRows = await transaction.$queryRaw<
        EffectiveInternalTradePolicyRow[]
      >(Prisma.sql`
        SELECT id, userSharePercent, adminSharePercent
        FROM internal_trade_policy_versions
        WHERE status = 'PUBLISHED'
          AND enabled = TRUE
          AND effectiveFrom <= ${now}
          AND (effectiveTo IS NULL OR effectiveTo > ${now})
        ORDER BY effectiveFrom DESC, versionNumber DESC
        LIMIT 1
        FOR SHARE
      `);
      const internalTradePolicy = internalTradePolicyRows[0] ?? null;
      const earningAuthority = internalTradePolicy
        ? ('INTERNAL_TRADING' as const)
        : ('LEGACY_REWARD' as const);

      const currency = packageItem.currency.toUpperCase();
      const sourceKey = `PAYOUT_REINVESTMENT:${actor.id}:${dto.requestKey}`;
      const totalWalletEventKey = `${sourceKey}:TOTAL_WALLET`;
      const proposedFundingId = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO ledger_transactions (
          id, kind, sourceKey, sourceType, sourceId, currency,
          postedByUserId, description, metadata, postedAt, createdAt
        ) VALUES (
          ${proposedFundingId},
          'PACKAGE_ACTIVATION_FUNDING',
          ${sourceKey},
          'PAYOUT_REINVESTMENT',
          ${dto.requestKey},
          ${currency},
          ${actor.id},
          ${`Package ${packageItem.packageDisplayName} funded by Total Wallet reinvestment.`},
          ${JSON.stringify({
            requestKey: dto.requestKey,
            userId: actor.id,
            packagePlanVersionId: packageItem.packagePlanVersionId,
            packagePlanItemId: packageItem.packagePlanItemId,
            packageDefinitionId: packageItem.packageDefinitionId,
            packageCode: packageItem.packageCode,
            packageDisplayName: packageItem.packageDisplayName,
            amount: requestedAmount,
            currency,
            fundingSource: 'TOTAL_WALLET',
            operation: 'REINVESTMENT',
            totalWalletEventKey,
            componentBalancesChanged: false,
          })},
          CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE sourceKey = VALUES(sourceKey)
      `);

      const fundingRows = await transaction.$queryRaw<LedgerTransactionRow[]>(
        Prisma.sql`
          SELECT id, sourceKey
          FROM ledger_transactions
          WHERE sourceKey = ${sourceKey}
          LIMIT 1
          FOR UPDATE
        `,
      );
      const fundingTransaction = fundingRows[0];
      if (!fundingTransaction) {
        throw new ServiceUnavailableException(
          'Reinvestment funding transaction could not be established.',
        );
      }

      const entryCounts = await transaction.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM ledger_entries
        WHERE transactionId = ${fundingTransaction.id}
      `);
      if (this.countNumber(entryCounts[0]?.total) > 0) {
        throw new ServiceUnavailableException(
          'Reinvestment funding exists without its subscription record; reconciliation requires investigation.',
        );
      }

      const controlAccount = await this.ensureAccount(transaction, {
        accountKey: totalWalletControlAccountKey(currency),
        bucket: 'PAYOUT_TOTAL_WALLET_CONTROL',
        currency,
        normalSide: 'DEBIT',
      });
      const principalAccount = await this.ensureAccount(transaction, {
        accountKey: packagePrincipalAccountKey(currency),
        bucket: 'PACKAGE_PRINCIPAL',
        currency,
        normalSide: 'CREDIT',
      });

      await insertTotalWalletEvent(transaction, {
        eventKey: totalWalletEventKey,
        userId: actor.id,
        currency,
        direction: 'DEBIT',
        amount: requestedAmount,
        reason: 'PACKAGE_PURCHASE',
        ledgerTransactionId: fundingTransaction.id,
        requireAvailable: true,
        insufficientMessage:
          'Total Wallet balance is insufficient for this reinvestment.',
      });

      await this.insertEntry(
        transaction,
        fundingTransaction.id,
        controlAccount.id,
        'DEBIT',
        requestedAmount,
        `Package ${packageItem.packageDisplayName} funded from authoritative Total Wallet by reinvestment.`,
      );
      await this.insertEntry(
        transaction,
        fundingTransaction.id,
        principalAccount.id,
        'CREDIT',
        requestedAmount,
        `Package ${packageItem.packageDisplayName} principal received.`,
      );
      await this.applyBalance(
        transaction,
        controlAccount,
        'DEBIT',
        requestedAmount,
      );
      await this.applyBalance(
        transaction,
        principalAccount,
        'CREDIT',
        requestedAmount,
      );
      await this.assertBalanced(transaction, fundingTransaction.id);

      const activatedAt = now;
      const scheduledEndAt = new Date(
        activatedAt.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );
      const subscriptionId = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO user_package_subscriptions (
          id,
          userId,
          sourceDepositId,
          sourceDepositAccountingTransactionId,
          fundingSource,
          purchaseRequestKey,
          fundingLedgerTransactionId,
          packagePlanVersionId,
          packagePlanItemId,
          packageDefinitionId,
          packageCode,
          packageDisplayName,
          price,
          minimumInvestment,
          maximumInvestment,
          durationDays,
          currency,
          activePackageMode,
          multipleActivePackageBasis,
          activationTrigger,
          renewalMode,
          upgradesEnabled,
          settlementTimezone,
          earningAuthority,
          internalTradeSplitPolicyVersionId,
          internalTradeUserSharePercent,
          internalTradeAdminSharePercent,
          rewardRateMode,
          fixedRewardRate,
          minimumRewardRate,
          maximumRewardRate,
          rewardRateMeaning,
          capBasis,
          capMultiplier,
          principalTreatment,
          goalDays,
          cycleDays,
          rewardStartMode,
          rewardFrequency,
          cycleDayMode,
          rewardDayMode,
          cycleEndAction,
          capReachedAction,
          status,
          activatedAt,
          scheduledEndAt,
          createdAt,
          updatedAt
        ) VALUES (
          ${subscriptionId},
          ${actor.id},
          NULL,
          NULL,
          'TOTAL_WALLET',
          ${dto.requestKey},
          ${fundingTransaction.id},
          ${packageItem.packagePlanVersionId},
          ${packageItem.packagePlanItemId},
          ${packageItem.packageDefinitionId},
          ${packageItem.packageCode},
          ${packageItem.packageDisplayName},
          ${requestedAmount},
          ${minimumInvestment},
          ${maximumInvestment},
          ${rangeConfigured ? durationDays : null},
          ${currency},
          ${packageItem.activePackageMode},
          ${packageItem.multipleActivePackageBasis},
          ${packageItem.activationTrigger},
          ${packageItem.renewalMode},
          ${Boolean(packageItem.upgradesEnabled)},
          ${platformTimezone},
          ${earningAuthority},
          ${internalTradePolicy?.id ?? null},
          ${
            internalTradePolicy
              ? new Prisma.Decimal(
                  internalTradePolicy.userSharePercent,
                ).toFixed(6)
              : null
          },
          ${
            internalTradePolicy
              ? new Prisma.Decimal(
                  internalTradePolicy.adminSharePercent,
                ).toFixed(6)
              : null
          },
          ${packageItem.rewardRateMode},
          ${
            packageItem.fixedRewardRate === null
              ? null
              : new Prisma.Decimal(packageItem.fixedRewardRate).toFixed(6)
          },
          ${
            packageItem.minimumRewardRate === null
              ? null
              : new Prisma.Decimal(packageItem.minimumRewardRate).toFixed(6)
          },
          ${
            packageItem.maximumRewardRate === null
              ? null
              : new Prisma.Decimal(packageItem.maximumRewardRate).toFixed(6)
          },
          ${packageItem.rewardRateMeaning},
          ${packageItem.capBasis},
          ${new Prisma.Decimal(packageItem.capMultiplier).toFixed(4)},
          ${packageItem.principalTreatment},
          ${packageItem.goalDays},
          ${packageItem.cycleDays},
          ${packageItem.rewardStartMode},
          ${packageItem.rewardFrequency},
          ${packageItem.cycleDayMode},
          ${packageItem.rewardDayMode},
          ${packageItem.cycleEndAction},
          ${packageItem.capReachedAction},
          'ACTIVE',
          ${activatedAt},
          ${scheduledEndAt},
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'ACTIVATE',
          entityType: 'UserPackageSubscription',
          entityId: subscriptionId,
          description:
            'USER reinvested authoritative Total Wallet into a package activation from the Payouts workspace.',
          metadata: {
            source: 'PAYOUT_REINVESTMENT',
            requestKey: dto.requestKey,
            userId: actor.id,
            packagePlanVersionId: packageItem.packagePlanVersionId,
            packagePlanItemId: packageItem.packagePlanItemId,
            packageDefinitionId: packageItem.packageDefinitionId,
            packageCode: packageItem.packageCode,
            packageDisplayName: packageItem.packageDisplayName,
            amount: requestedAmount,
            currency,
            fundingSource: 'TOTAL_WALLET',
            operation: 'REINVESTMENT',
            totalWalletEventKey,
            fundingLedgerTransactionId: fundingTransaction.id,
            componentBalancesChanged: false,
            balanced: true,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        created: true,
        subscriptionId,
        fundingLedgerTransactionId: fundingTransaction.id,
        amount: requestedAmount,
        currency,
      };
    });

    const downstream = await this.postActivationService.process(
      activation.subscriptionId,
      actor,
      context,
    );

    return {
      ...activation,
      ...downstream,
      fundingSource: 'TOTAL_WALLET' as const,
      operation: 'REINVESTMENT' as const,
      componentBalancesChanged: false,
      message: downstream.downstreamPending
        ? 'Reinvestment activated the package. One or more downstream earning stages remain safely recoverable.'
        : 'Reinvestment activated the package from Total Wallet.',
    };
  }

  private async ensureAccount(
    transaction: Prisma.TransactionClient,
    input: {
      accountKey: string;
      bucket: LedgerAccountRow['bucket'];
      currency: string;
      normalSide: LedgerSide;
    },
  ) {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_accounts (
        id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide, createdAt
      ) VALUES (
        ${randomUUID()}, ${input.accountKey}, 'SYSTEM', NULL, ${input.bucket},
        ${input.currency}, ${input.normalSide}, CURRENT_TIMESTAMP(3)
      )
      ON DUPLICATE KEY UPDATE accountKey = VALUES(accountKey)
    `);

    const rows = await transaction.$queryRaw<LedgerAccountRow[]>(Prisma.sql`
      SELECT id, accountKey, ownerType, ownerUserId, bucket, currency, normalSide
      FROM ledger_accounts
      WHERE accountKey = ${input.accountKey}
      LIMIT 1
      FOR UPDATE
    `);
    const account = rows[0];
    if (
      !account ||
      account.ownerType !== 'SYSTEM' ||
      account.ownerUserId !== null ||
      account.bucket !== input.bucket ||
      account.currency !== input.currency ||
      account.normalSide !== input.normalSide
    ) {
      throw new ServiceUnavailableException(
        'Reinvestment ledger account semantics are inconsistent.',
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
    transactionId: string,
    accountId: string,
    side: LedgerSide,
    amount: string,
    memo: string,
  ) {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO ledger_entries (
        id, transactionId, accountId, side, amount, memo, createdAt
      ) VALUES (
        ${randomUUID()}, ${transactionId}, ${accountId}, ${side}, ${amount},
        ${memo}, CURRENT_TIMESTAMP(3)
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
        balance = balance + (${direction} * CAST(${amount} AS DECIMAL(20, 8))),
        revision = revision + 1,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE accountId = ${account.id}
        AND balance + (${direction} * CAST(${amount} AS DECIMAL(20, 8))) >= 0
    `);
    if (updated !== 1) {
      throw new ConflictException(
        'Reinvestment ledger balance update failed.',
      );
    }
  }

  private async assertBalanced(
    transaction: Prisma.TransactionClient,
    transactionId: string,
  ) {
    const entries = await transaction.$queryRaw<LedgerEntryRow[]>(Prisma.sql`
      SELECT side, amount
      FROM ledger_entries
      WHERE transactionId = ${transactionId}
      ORDER BY createdAt ASC, id ASC
    `);
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    for (const entry of entries) {
      const amount = new Prisma.Decimal(entry.amount);
      if (entry.side === 'DEBIT') debit = debit.add(amount);
      else credit = credit.add(amount);
    }
    if (entries.length !== 2 || debit.lte(0) || !debit.equals(credit)) {
      throw new ServiceUnavailableException(
        'Reinvestment ledger transaction is not balanced.',
      );
    }
  }

  private countNumber(value: CountRow['total'] | undefined) {
    if (value === undefined) return 0;
    return Number(value);
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
        if (!retryable || attempt === MAX_SERIALIZABLE_ATTEMPTS) throw error;
      }
    }
    throw lastError;
  }
}
