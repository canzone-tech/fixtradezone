import { randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  deterministicSimulatedSlot,
  localDateForInstant,
  localDateStartUtc,
  validateIanaTimezone,
  validateTimingWindows,
} from './simulated-activity.calculation';
import {
  SIMULATED_ACTIVITY_BATCH_LIMIT,
  SIMULATED_ACTIVITY_MAX_PER_DAY,
  simulatedActivitySourceKey,
  type SimulatedActivityOutcome,
  type SimulatedTimingWindow,
} from './simulated-activity.constants';

type DecimalValue = Prisma.Decimal | number | string;

interface RecoveryCandidateRow {
  subscriptionId: string;
  userId: string;
  packagePlanVersionId: string;
  packagePlanItemId: string;
  packageCode: string;
  packageDisplayName: string;
  scheduledEndAt: Date;
  settlementTimezone: string;
  finalLocalDate: string | Date;
  timezoneSnapshot: string;
}

interface PolicyRow {
  id: string;
  versionNumber: number;
  status: 'PUBLISHED';
  enabled: boolean | number;
  activitiesPerDay: number;
  minimumGapMinutes: number | null;
  assetSymbols: unknown;
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: DecimalValue;
  winMaximumPercent: DecimalValue;
  lossMinimumPercent: DecimalValue;
  lossMaximumPercent: DecimalValue;
  timingWindows: unknown;
  timezoneSnapshot: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

interface ExistingEventRow {
  id: string;
  sourceKey: string;
  policyVersionId: string;
  slotNumber: number;
}

export interface SimulatedActivityFinalDayRecoverySummary {
  scannedSubscriptions: number;
  processedSubscriptions: number;
  createdEvents: number;
  alreadyPresent: number;
  skippedNotDue: number;
  failedSubscriptions: number;
  failures: Array<{ subscriptionId: string; message: string }>;
}

@Injectable()
export class SimulatedActivityFinalDayRecoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async processDueBatch(
    asOf = new Date(),
  ): Promise<SimulatedActivityFinalDayRecoverySummary> {
    const candidates = await this.prisma.$queryRaw<RecoveryCandidateRow[]>(
      Prisma.sql`
        SELECT
          ups.id AS subscriptionId,
          ups.userId,
          ups.packagePlanVersionId,
          ups.packagePlanItemId,
          ups.packageCode,
          ups.packageDisplayName,
          ups.scheduledEndAt,
          ups.settlementTimezone,
          its.finalLocalDate,
          its.timezoneSnapshot
        FROM user_package_subscriptions ups
        INNER JOIN internal_trade_subscription_states its
          ON its.subscriptionId = ups.id
        WHERE ups.status = 'ACTIVE'
          AND ups.earningAuthority = 'INTERNAL_TRADING'
          AND its.status = 'ACTIVE'
          AND its.nextTradeLocalDate = its.finalLocalDate
          AND ups.scheduledEndAt <= ${asOf}
        ORDER BY ups.scheduledEndAt ASC, ups.id ASC
        LIMIT ${SIMULATED_ACTIVITY_BATCH_LIMIT}
      `,
    );

    const summary: SimulatedActivityFinalDayRecoverySummary = {
      scannedSubscriptions: candidates.length,
      processedSubscriptions: 0,
      createdEvents: 0,
      alreadyPresent: 0,
      skippedNotDue: 0,
      failedSubscriptions: 0,
      failures: [],
    };

    for (const candidate of candidates) {
      try {
        const result = await this.recoverSubscription(candidate, asOf);
        summary.processedSubscriptions += 1;
        summary.createdEvents += result.createdEvents;
        summary.alreadyPresent += result.alreadyPresent;
        summary.skippedNotDue += result.skippedNotDue;
      } catch (error) {
        summary.failedSubscriptions += 1;
        summary.failures.push({
          subscriptionId: candidate.subscriptionId,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown final-day Daily Trade recovery error.',
        });
      }
    }

    return summary;
  }

  private async recoverSubscription(
    candidate: RecoveryCandidateRow,
    asOf: Date,
  ) {
    if (candidate.settlementTimezone !== candidate.timezoneSnapshot) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery timezone does not match the internal trading lifecycle snapshot.',
      );
    }

    validateIanaTimezone(candidate.timezoneSnapshot);

    const finalLocalDate = this.localDateString(candidate.finalLocalDate);
    const scheduledEndLocalDate = localDateForInstant(
      candidate.scheduledEndAt,
      candidate.timezoneSnapshot,
    );

    if (scheduledEndLocalDate !== finalLocalDate) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery date does not match the package lifecycle final date.',
      );
    }

    const existingEvents = await this.prisma.$queryRaw<ExistingEventRow[]>(
      Prisma.sql`
        SELECT id, sourceKey, policyVersionId, slotNumber
        FROM simulated_trade_activity_events
        WHERE subscriptionId = ${candidate.subscriptionId}
          AND localActivityDate = ${finalLocalDate}
        ORDER BY slotNumber ASC, createdAt ASC
      `,
    );

    const policy = await this.resolvePolicy(
      candidate,
      finalLocalDate,
      existingEvents,
    );
    const config = this.policyConfig(policy);

    if (!config.enabled) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery policy is disabled.',
      );
    }

    const existingBySlot = new Map<number, ExistingEventRow>();
    existingEvents.forEach((event, index) => {
      if (event.slotNumber !== index + 1) {
        throw new ServiceUnavailableException(
          'Final-day Daily Trade recovery found non-contiguous existing slots.',
        );
      }
      if (event.policyVersionId !== policy.id) {
        throw new ServiceUnavailableException(
          'Final-day Daily Trade recovery found a policy mismatch in existing events.',
        );
      }
      const expectedSourceKey = simulatedActivitySourceKey(
        candidate.subscriptionId,
        policy.id,
        finalLocalDate,
        event.slotNumber,
      );
      if (event.sourceKey !== expectedSourceKey) {
        throw new ServiceUnavailableException(
          'Final-day Daily Trade recovery found an unexpected source key.',
        );
      }
      existingBySlot.set(event.slotNumber, event);
    });

    if (existingEvents.length > config.activitiesPerDay) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery found more events than the effective policy allows.',
      );
    }

    let createdEvents = 0;
    let alreadyPresent = 0;
    let skippedNotDue = 0;

    for (
      let slotNumber = 1;
      slotNumber <= config.activitiesPerDay;
      slotNumber += 1
    ) {
      const sourceKey = simulatedActivitySourceKey(
        candidate.subscriptionId,
        policy.id,
        finalLocalDate,
        slotNumber,
      );
      const slot = deterministicSimulatedSlot({
        sourceKey,
        localActivityDate: finalLocalDate,
        slotNumber,
        activitiesPerDay: config.activitiesPerDay,
        minimumGapMinutes: config.minimumGapMinutes,
        assetSymbols: config.assetSymbols,
        winWeight: config.winWeight,
        lossWeight: config.lossWeight,
        winMinimumPercent: config.winMinimumPercent,
        winMaximumPercent: config.winMaximumPercent,
        lossMinimumPercent: config.lossMinimumPercent,
        lossMaximumPercent: config.lossMaximumPercent,
        timingWindows: config.timingWindows,
        timezoneSnapshot: candidate.timezoneSnapshot,
      });

      const existing = existingBySlot.get(slotNumber);
      if (existing) {
        alreadyPresent += 1;
        continue;
      }

      if (slot.scheduledAt.getTime() > asOf.getTime()) {
        skippedNotDue += 1;
        continue;
      }

      const eventId = randomUUID();
      const inserted = await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO simulated_trade_activity_events (
          id,
          sourceKey,
          subscriptionId,
          userId,
          policyVersionId,
          packagePlanVersionId,
          packagePlanItemId,
          packageCode,
          packageDisplayName,
          localActivityDate,
          slotNumber,
          scheduledAt,
          timezoneSnapshot,
          assetSymbol,
          outcome,
          resultPercent,
          generationSource,
          generatedByUserId,
          generatedAt,
          createdAt
        ) VALUES (
          ${eventId},
          ${sourceKey},
          ${candidate.subscriptionId},
          ${candidate.userId},
          ${policy.id},
          ${candidate.packagePlanVersionId},
          ${candidate.packagePlanItemId},
          ${candidate.packageCode},
          ${candidate.packageDisplayName},
          ${finalLocalDate},
          ${slotNumber},
          ${slot.scheduledAt},
          ${candidate.timezoneSnapshot},
          ${slot.assetSymbol},
          ${slot.outcome},
          ${slot.resultPercent},
          'WORKER',
          NULL,
          ${asOf},
          CURRENT_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE id = id
      `);

      if (inserted === 1) createdEvents += 1;
      else alreadyPresent += 1;
    }

    return { createdEvents, alreadyPresent, skippedNotDue };
  }

  private async resolvePolicy(
    candidate: RecoveryCandidateRow,
    finalLocalDate: string,
    existingEvents: ExistingEventRow[],
  ): Promise<PolicyRow> {
    const policyIds = [...new Set(existingEvents.map((event) => event.policyVersionId))];

    if (policyIds.length > 1) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery found multiple policies on one local date.',
      );
    }

    const rows = policyIds[0]
      ? await this.prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
          SELECT *
          FROM simulated_activity_policy_versions
          WHERE id = ${policyIds[0]}
            AND status = 'PUBLISHED'
          LIMIT 1
        `)
      : await this.prisma.$queryRaw<PolicyRow[]>(Prisma.sql`
          SELECT *
          FROM simulated_activity_policy_versions
          WHERE status = 'PUBLISHED'
            AND effectiveFrom <= ${localDateStartUtc(
              finalLocalDate,
              candidate.timezoneSnapshot,
            )}
            AND (
              effectiveTo IS NULL
              OR effectiveTo > ${localDateStartUtc(
                finalLocalDate,
                candidate.timezoneSnapshot,
              )}
            )
          ORDER BY effectiveFrom DESC, versionNumber DESC
          LIMIT 2
        `);

    if (rows.length !== 1) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery could not resolve exactly one effective policy.',
      );
    }

    const policy = rows[0];
    if (policy.timezoneSnapshot !== candidate.timezoneSnapshot) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery policy timezone does not match the package lifecycle snapshot.',
      );
    }

    return policy;
  }

  private policyConfig(policy: PolicyRow) {
    const activitiesPerDay = Number(policy.activitiesPerDay);
    const minimumGapMinutes = Number(policy.minimumGapMinutes ?? 0);
    const assetSymbols = this.stringArray(policy.assetSymbols);
    const timingWindows = this.timingWindows(policy.timingWindows);

    if (
      !Number.isInteger(activitiesPerDay) ||
      activitiesPerDay < 1 ||
      activitiesPerDay > SIMULATED_ACTIVITY_MAX_PER_DAY
    ) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery policy activity count is invalid.',
      );
    }

    if (
      !Number.isInteger(policy.winWeight) ||
      !Number.isInteger(policy.lossWeight) ||
      policy.winWeight < 0 ||
      policy.lossWeight < 0 ||
      policy.winWeight + policy.lossWeight <= 0
    ) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery policy outcome weights are invalid.',
      );
    }

    validateTimingWindows(
      timingWindows,
      activitiesPerDay,
      minimumGapMinutes,
    );

    return {
      enabled: Boolean(policy.enabled),
      activitiesPerDay,
      minimumGapMinutes,
      assetSymbols,
      winWeight: policy.winWeight,
      lossWeight: policy.lossWeight,
      winMinimumPercent: new Prisma.Decimal(policy.winMinimumPercent).toFixed(6),
      winMaximumPercent: new Prisma.Decimal(policy.winMaximumPercent).toFixed(6),
      lossMinimumPercent: new Prisma.Decimal(policy.lossMinimumPercent).toFixed(6),
      lossMaximumPercent: new Prisma.Decimal(policy.lossMaximumPercent).toFixed(6),
      timingWindows,
    };
  }

  private stringArray(value: unknown): string[] {
    const parsed = this.jsonValue(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some(
        (entry) => typeof entry !== 'string' || entry.trim().length === 0,
      )
    ) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery asset configuration is invalid.',
      );
    }
    return parsed.map((entry) => String(entry).trim().toUpperCase());
  }

  private timingWindows(value: unknown): SimulatedTimingWindow[] {
    const parsed = this.jsonValue(value);
    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery timing configuration is invalid.',
      );
    }

    return parsed.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new ServiceUnavailableException(
          'Final-day Daily Trade recovery timing window is invalid.',
        );
      }
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.start !== 'string' ||
        typeof candidate.end !== 'string'
      ) {
        throw new ServiceUnavailableException(
          'Final-day Daily Trade recovery timing window is invalid.',
        );
      }
      return { start: candidate.start, end: candidate.end };
    });
  }

  private jsonValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      throw new ServiceUnavailableException(
        'Final-day Daily Trade recovery JSON configuration is invalid.',
      );
    }
  }

  private localDateString(value: string | Date): string {
    return typeof value === 'string'
      ? value.slice(0, 10)
      : value.toISOString().slice(0, 10);
  }
}
