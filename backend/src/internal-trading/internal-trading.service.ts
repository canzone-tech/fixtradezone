import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  CreateInternalTradingPolicyDraftDto,
  PublishInternalTradingPolicyDto,
  UpdateInternalTradingPolicyDto,
} from './dto/internal-trading.dto';
import {
  INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY,
  type InternalTradingPolicyStatus,
  type InternalTradingTimingWindow,
} from './internal-trading.constants';

type DecimalValue = Prisma.Decimal | number | string;

interface InternalTradingPolicyRow {
  id: string;
  versionNumber: number;
  status: InternalTradingPolicyStatus;
  revision: number;
  enabled: boolean | number;
  activitiesPerDay: number;
  assetSymbols: unknown;
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: DecimalValue;
  winMaximumPercent: DecimalValue;
  lossMinimumPercent: DecimalValue;
  lossMaximumPercent: DecimalValue;
  timingWindows: unknown;
  userSharePercent: DecimalValue;
  adminSharePercent: DecimalValue;
  timezoneSnapshot: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  publishedAt: Date | null;
  clonedFromPolicyVersionId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OperationsConfigRow {
  platformTimezone: string;
}

interface NormalizedPolicyConfig {
  enabled: boolean;
  activitiesPerDay: number;
  assetSymbols: string[];
  winWeight: number;
  lossWeight: number;
  winMinimumPercent: string;
  winMaximumPercent: string;
  lossMinimumPercent: string;
  lossMaximumPercent: string;
  timingWindows: InternalTradingTimingWindow[];
  userSharePercent: string;
  adminSharePercent: string;
}

@Injectable()
export class InternalTradingService {
  constructor(private readonly prisma: PrismaService) {}

  async listPolicies() {
    const rows = await this.prisma.$queryRaw<InternalTradingPolicyRow[]>(
      Prisma.sql`
        SELECT *
        FROM internal_trade_policy_versions
        ORDER BY versionNumber DESC
      `,
    );

    return {
      policies: rows.map((row) => this.policySnapshot(row)),
    };
  }

  async getPolicy(policyVersionId: string) {
    const policy = await this.requirePolicy(
      this.prisma,
      policyVersionId,
      false,
    );

    return this.policySnapshot(policy);
  }

  async createPolicyDraft(
    dto: CreateInternalTradingPolicyDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.runSerializable(async (transaction) => {
      const draftRows = await transaction.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id
          FROM internal_trade_policy_versions
          WHERE status = 'DRAFT'
          LIMIT 1
          FOR UPDATE
        `,
      );

      if (draftRows.length > 0) {
        throw new ConflictException(
          'An internal trading policy draft already exists.',
        );
      }

      const source = await this.requirePolicy(
        transaction,
        dto.sourcePolicyVersionId,
        true,
      );

      if (source.status !== 'PUBLISHED') {
        throw new ConflictException(
          'Only a published internal trading policy may be cloned.',
        );
      }

      const config = this.normalizedPolicyConfig(source);
      this.validatePolicyConfig(config);

      const versionRows = await transaction.$queryRaw<
        { maxVersion: number | null }[]
      >(Prisma.sql`
        SELECT MAX(versionNumber) AS maxVersion
        FROM internal_trade_policy_versions
      `);

      const versionNumber = (versionRows[0]?.maxVersion ?? 0) + 1;
      const id = randomUUID();

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO internal_trade_policy_versions (
          id,
          versionNumber,
          status,
          revision,
          enabled,
          activitiesPerDay,
          assetSymbols,
          winWeight,
          lossWeight,
          winMinimumPercent,
          winMaximumPercent,
          lossMinimumPercent,
          lossMaximumPercent,
          timingWindows,
          userSharePercent,
          adminSharePercent,
          timezoneSnapshot,
          effectiveFrom,
          effectiveTo,
          publishedAt,
          clonedFromPolicyVersionId,
          createdByUserId,
          updatedByUserId,
          publishedByUserId,
          createdAt,
          updatedAt
        ) VALUES (
          ${id},
          ${versionNumber},
          'DRAFT',
          1,
          ${config.enabled},
          ${config.activitiesPerDay},
          ${JSON.stringify(config.assetSymbols)},
          ${config.winWeight},
          ${config.lossWeight},
          ${config.winMinimumPercent},
          ${config.winMaximumPercent},
          ${config.lossMinimumPercent},
          ${config.lossMaximumPercent},
          ${JSON.stringify(config.timingWindows)},
          ${config.userSharePercent},
          ${config.adminSharePercent},
          NULL,
          NULL,
          NULL,
          NULL,
          ${source.id},
          ${actor.id},
          ${actor.id},
          NULL,
          CURRENT_TIMESTAMP(3),
          CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'InternalTradePolicyVersion',
          entityId: id,
          description:
            'SUPER_ADMIN cloned a published internal trading policy into a draft.',
          metadata: {
            source: 'INTERNAL_TRADING_POLICY',
            operation: 'CLONE_DRAFT',
            sourcePolicyVersionId: source.id,
            versionNumber,
            reason: dto.reason,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, id, false),
      );
    });
  }

  async updatePolicyDraft(
    policyVersionId: string,
    dto: UpdateInternalTradingPolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.runSerializable(async (transaction) => {
      const current = await this.requirePolicy(
        transaction,
        policyVersionId,
        true,
      );

      if (current.status !== 'DRAFT') {
        throw new ConflictException(
          'Published internal trading policies are immutable.',
        );
      }

      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Internal trading policy draft changed. Reload before saving.',
        );
      }

      const previous = this.normalizedPolicyConfig(current);

      const next: NormalizedPolicyConfig = {
        enabled: dto.enabled ?? previous.enabled,
        activitiesPerDay: dto.activitiesPerDay ?? previous.activitiesPerDay,
        assetSymbols: dto.assetSymbols ?? previous.assetSymbols,
        winWeight: dto.winWeight ?? previous.winWeight,
        lossWeight: dto.lossWeight ?? previous.lossWeight,
        winMinimumPercent: dto.winMinimumPercent ?? previous.winMinimumPercent,
        winMaximumPercent: dto.winMaximumPercent ?? previous.winMaximumPercent,
        lossMinimumPercent:
          dto.lossMinimumPercent ?? previous.lossMinimumPercent,
        lossMaximumPercent:
          dto.lossMaximumPercent ?? previous.lossMaximumPercent,
        timingWindows: dto.timingWindows ?? previous.timingWindows,
        userSharePercent: dto.userSharePercent ?? previous.userSharePercent,
        adminSharePercent: dto.adminSharePercent ?? previous.adminSharePercent,
      };

      this.validatePolicyConfig(next);

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE internal_trade_policy_versions
        SET
          enabled = ${next.enabled},
          activitiesPerDay = ${next.activitiesPerDay},
          assetSymbols = ${JSON.stringify(next.assetSymbols)},
          winWeight = ${next.winWeight},
          lossWeight = ${next.lossWeight},
          winMinimumPercent = ${next.winMinimumPercent},
          winMaximumPercent = ${next.winMaximumPercent},
          lossMinimumPercent = ${next.lossMinimumPercent},
          lossMaximumPercent = ${next.lossMaximumPercent},
          timingWindows = ${JSON.stringify(next.timingWindows)},
          userSharePercent = ${next.userSharePercent},
          adminSharePercent = ${next.adminSharePercent},
          updatedByUserId = ${actor.id},
          revision = revision + 1,
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${dto.expectedRevision}
      `);

      if (updated !== 1) {
        throw new ConflictException(
          'Internal trading policy draft changed. Reload before saving.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'InternalTradePolicyVersion',
          entityId: policyVersionId,
          description:
            'SUPER_ADMIN updated internal trading global policy draft.',
          metadata: {
            source: 'INTERNAL_TRADING_POLICY',
            operation: 'UPDATE_DRAFT',
            reason: dto.reason,
            before: previous as unknown as Prisma.InputJsonObject,
            after: next as unknown as Prisma.InputJsonObject,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, policyVersionId, false),
      );
    });
  }

  async publishPolicy(
    policyVersionId: string,
    dto: PublishInternalTradingPolicyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);

    return this.runSerializable(async (transaction) => {
      const current = await this.requirePolicy(
        transaction,
        policyVersionId,
        true,
      );

      if (current.status !== 'DRAFT') {
        throw new ConflictException(
          'Published internal trading policies are immutable.',
        );
      }

      if (current.revision !== dto.expectedRevision) {
        throw new ConflictException(
          'Internal trading policy draft changed. Reload before publishing.',
        );
      }

      const config = this.normalizedPolicyConfig(current);
      this.validatePolicyConfig(config);

      const operationsRows = await transaction.$queryRaw<
        OperationsConfigRow[]
      >(Prisma.sql`
          SELECT platformTimezone
          FROM system_operations_config
          WHERE id = 1
          LIMIT 1
          FOR UPDATE
        `);

      const timezoneSnapshot = operationsRows[0]?.platformTimezone?.trim();

      if (!timezoneSnapshot) {
        throw new ServiceUnavailableException(
          'Platform Operations timezone is unavailable.',
        );
      }

      validateIanaTimezone(timezoneSnapshot);

      const publishedAt = new Date();

      const openPolicies = await transaction.$queryRaw<
        InternalTradingPolicyRow[]
      >(
        Prisma.sql`
            SELECT *
            FROM internal_trade_policy_versions
            WHERE status = 'PUBLISHED'
              AND effectiveTo IS NULL
            ORDER BY versionNumber DESC
            FOR UPDATE
          `,
      );

      if (openPolicies.length > 1) {
        throw new ServiceUnavailableException(
          'Multiple open internal trading policies exist.',
        );
      }

      const predecessor = openPolicies[0] ?? null;

      let predecessorEnd: Date | null = null;
      let effectiveFrom: Date;

      if (predecessor) {
        if (!predecessor.effectiveFrom || !predecessor.timezoneSnapshot) {
          throw new ServiceUnavailableException(
            'Current published internal trading policy is incomplete.',
          );
        }

        if (predecessor.effectiveFrom > publishedAt) {
          throw new ConflictException(
            'Current published policy has not reached its first effective trading day yet.',
          );
        }

        validateIanaTimezone(predecessor.timezoneSnapshot);

        predecessorEnd = nextLocalDateStartUtc(
          publishedAt,
          predecessor.timezoneSnapshot,
        );

        effectiveFrom = localDateStartAtOrAfterUtc(
          predecessorEnd,
          timezoneSnapshot,
        );
      } else {
        effectiveFrom = nextLocalDateStartUtc(publishedAt, timezoneSnapshot);
      }

      const conflicts = await transaction.$queryRaw<InternalTradingPolicyRow[]>(
        Prisma.sql`
            SELECT *
            FROM internal_trade_policy_versions
            WHERE status = 'PUBLISHED'
              AND id <> ${predecessor?.id ?? ''}
              AND effectiveFrom <= ${effectiveFrom}
              AND (
                effectiveTo IS NULL
                OR effectiveTo > ${effectiveFrom}
              )
            LIMIT 2
            FOR UPDATE
          `,
      );

      if (conflicts.length > 0) {
        throw new ConflictException(
          'Internal trading policy effective boundary overlaps another policy.',
        );
      }

      if (predecessor && predecessorEnd) {
        const predecessorUpdated = await transaction.$executeRaw(Prisma.sql`
            UPDATE internal_trade_policy_versions
            SET
              effectiveTo = ${predecessorEnd},
              updatedByUserId = ${actor.id},
              revision = revision + 1,
              updatedAt = CURRENT_TIMESTAMP(3)
            WHERE id = ${predecessor.id}
              AND effectiveTo IS NULL
          `);

        if (predecessorUpdated !== 1) {
          throw new ConflictException(
            'Predecessor internal trading policy changed.',
          );
        }
      }

      const updated = await transaction.$executeRaw(Prisma.sql`
        UPDATE internal_trade_policy_versions
        SET
          status = 'PUBLISHED',
          timezoneSnapshot = ${timezoneSnapshot},
          effectiveFrom = ${effectiveFrom},
          effectiveTo = NULL,
          publishedAt = ${publishedAt},
          publishedByUserId = ${actor.id},
          updatedByUserId = ${actor.id},
          revision = revision + 1,
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${policyVersionId}
          AND status = 'DRAFT'
          AND revision = ${dto.expectedRevision}
      `);

      if (updated !== 1) {
        throw new ConflictException(
          'Internal trading policy draft changed. Reload before publishing.',
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'APPROVE',
          entityType: 'InternalTradePolicyVersion',
          entityId: policyVersionId,
          description: 'SUPER_ADMIN published internal trading global policy.',
          metadata: {
            source: 'INTERNAL_TRADING_POLICY',
            operation: 'PUBLISH',
            reason: dto.reason,
            versionNumber: current.versionNumber,
            timezoneSnapshot,
            effectiveFrom: effectiveFrom.toISOString(),
            predecessorPolicyVersionId: predecessor?.id ?? null,
            predecessorEffectiveTo: predecessorEnd?.toISOString() ?? null,
            configuration: config as unknown as Prisma.InputJsonObject,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return this.policySnapshot(
        await this.requirePolicy(transaction, policyVersionId, false),
      );
    });
  }

  private async requirePolicy(
    client: Prisma.TransactionClient | PrismaService,
    policyVersionId: string,
    forUpdate: boolean,
  ) {
    const lock = forUpdate ? Prisma.sql`FOR UPDATE` : Prisma.empty;

    const rows = await client.$queryRaw<InternalTradingPolicyRow[]>(Prisma.sql`
        SELECT *
        FROM internal_trade_policy_versions
        WHERE id = ${policyVersionId}
        LIMIT 1
        ${lock}
      `);

    if (!rows[0]) {
      throw new NotFoundException('Internal trading policy was not found.');
    }

    return rows[0];
  }

  private normalizedPolicyConfig(
    row: InternalTradingPolicyRow,
  ): NormalizedPolicyConfig {
    return {
      enabled: Boolean(row.enabled),
      activitiesPerDay: Number(row.activitiesPerDay),
      assetSymbols: this.jsonArray<string>(
        row.assetSymbols,
        'assetSymbols',
      ).map((value) => value.trim().toUpperCase()),
      winWeight: Number(row.winWeight),
      lossWeight: Number(row.lossWeight),
      winMinimumPercent: this.percentString(row.winMinimumPercent),
      winMaximumPercent: this.percentString(row.winMaximumPercent),
      lossMinimumPercent: this.percentString(row.lossMinimumPercent),
      lossMaximumPercent: this.percentString(row.lossMaximumPercent),
      timingWindows: this.jsonArray<InternalTradingTimingWindow>(
        row.timingWindows,
        'timingWindows',
      ).map((window) => ({
        start: window.start,
        end: window.end,
      })),
      userSharePercent: this.percentString(row.userSharePercent),
      adminSharePercent: this.percentString(row.adminSharePercent),
    };
  }

  private validatePolicyConfig(config: NormalizedPolicyConfig): void {
    if (
      !Number.isInteger(config.activitiesPerDay) ||
      config.activitiesPerDay < INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY
    ) {
      throw new BadRequestException(
        `activitiesPerDay must be at least ${INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY}.`,
      );
    }

    if (
      config.assetSymbols.length < 1 ||
      config.assetSymbols.length > 50 ||
      new Set(config.assetSymbols).size !== config.assetSymbols.length ||
      config.assetSymbols.some((asset) => !/^[A-Z0-9._-]{2,32}$/.test(asset))
    ) {
      throw new BadRequestException(
        'Internal trading asset symbols are invalid.',
      );
    }

    if (
      !Number.isInteger(config.winWeight) ||
      !Number.isInteger(config.lossWeight) ||
      config.winWeight < 0 ||
      config.lossWeight < 0 ||
      config.winWeight + config.lossWeight <= 0
    ) {
      throw new BadRequestException(
        'Internal trading WIN/LOSS weights are invalid.',
      );
    }

    const winMin = new Prisma.Decimal(config.winMinimumPercent);
    const winMax = new Prisma.Decimal(config.winMaximumPercent);
    const lossMin = new Prisma.Decimal(config.lossMinimumPercent);
    const lossMax = new Prisma.Decimal(config.lossMaximumPercent);

    if (
      winMin.lte(0) ||
      winMax.lt(winMin) ||
      winMax.gt(100) ||
      lossMin.lte(0) ||
      lossMax.lt(lossMin) ||
      lossMax.gt(100)
    ) {
      throw new BadRequestException(
        'Internal trading WIN/LOSS percentage ranges are invalid.',
      );
    }

    const userShare = new Prisma.Decimal(config.userSharePercent);
    const adminShare = new Prisma.Decimal(config.adminSharePercent);

    if (
      userShare.lt(0) ||
      userShare.gt(100) ||
      adminShare.lt(0) ||
      adminShare.gt(100) ||
      !userShare.plus(adminShare).equals(100)
    ) {
      throw new BadRequestException(
        'USER share and ADMIN share must each be between 0 and 100 and must total exactly 100.',
      );
    }

    validateTimingWindows(config.timingWindows, config.activitiesPerDay);
  }

  private policySnapshot(row: InternalTradingPolicyRow) {
    const config = this.normalizedPolicyConfig(row);

    return {
      id: row.id,
      versionNumber: row.versionNumber,
      status: row.status,
      revision: row.revision,

      scope: 'GLOBAL' as const,
      financialModel: 'GROSS_BEFORE_SPLIT' as const,
      splitSnapshotMode: 'PACKAGE_ACTIVATION' as const,
      packageOverrideAllowed: false,
      adminOverrideAllowed: false,

      ...config,

      minimumActivitiesPerDay: INTERNAL_TRADING_MIN_ACTIVITIES_PER_DAY,

      timezoneSnapshot: row.timezoneSnapshot,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      publishedAt: row.publishedAt,

      clonedFromPolicyVersionId: row.clonedFromPolicyVersionId,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      publishedByUserId: row.publishedByUserId,

      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private percentString(value: DecimalValue): string {
    return new Prisma.Decimal(value).toFixed(6);
  }

  private jsonArray<T>(value: unknown, fieldName: string): T[] {
    let parsed = value;

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        throw new ServiceUnavailableException(
          `Internal trading policy ${fieldName} is malformed.`,
        );
      }
    }

    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        `Internal trading policy ${fieldName} is malformed.`,
      );
    }

    return parsed as T[];
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }

  private async runSerializable<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}

function validateTimingWindows(
  windows: InternalTradingTimingWindow[],
  activitiesPerDay: number,
): void {
  if (windows.length < 1 || windows.length > 12) {
    throw new BadRequestException(
      'At least one valid trading timing window is required.',
    );
  }

  let previousEnd = -1;
  let totalMinutes = 0;

  for (const window of windows) {
    const start = clockMinute(window.start);
    const end = clockMinute(window.end);

    if (end <= start) {
      throw new BadRequestException(
        'Trading timing windows must end after they start.',
      );
    }

    if (start < previousEnd) {
      throw new BadRequestException(
        'Trading timing windows cannot overlap or be out of order.',
      );
    }

    previousEnd = end;
    totalMinutes += end - start;
  }

  if (totalMinutes < activitiesPerDay) {
    throw new BadRequestException(
      'Trading timing windows are too small for configured daily trade count.',
    );
  }
}

function clockMinute(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new BadRequestException('Trading timing values must use HH:MM.');
  }

  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function validateIanaTimezone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone,
    }).format(new Date());
  } catch {
    throw new BadRequestException(
      'Platform timezone must be a valid IANA timezone.',
    );
  }
}

function nextLocalDateStartUtc(date: Date, timeZone: string): Date {
  const localDate = localDateForInstant(date, timeZone);
  return localDateStartUtc(addLocalDays(localDate, 1), timeZone);
}

function localDateStartAtOrAfterUtc(date: Date, timeZone: string): Date {
  const localDate = localDateForInstant(date, timeZone);
  const start = localDateStartUtc(localDate, timeZone);

  return start.getTime() >= date.getTime()
    ? start
    : nextLocalDateStartUtc(date, timeZone);
}

function localDateForInstant(date: Date, timeZone: string): string {
  const parts = dateFormatter(timeZone).formatToParts(date);

  return [part(parts, 'year'), part(parts, 'month'), part(parts, 'day')].join(
    '-',
  );
}

function addLocalDays(localDate: string, days: number): string {
  const parsed = parseLocalDate(localDate);

  const shifted = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + days),
  );

  return [
    shifted.getUTCFullYear().toString().padStart(4, '0'),
    (shifted.getUTCMonth() + 1).toString().padStart(2, '0'),
    shifted.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

function localDateStartUtc(localDate: string, timeZone: string): Date {
  return localDateTimeUtc(localDate, 0, 0, timeZone);
}

function localDateTimeUtc(
  localDate: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const parsed = parseLocalDate(localDate);

  const desiredAsUtc = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    hour,
    minute,
    0,
    0,
  );

  let guess = new Date(desiredAsUtc);
  const formatter = dateTimeFormatter(timeZone);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = formatter.formatToParts(guess);

    const renderedAsUtc = Date.UTC(
      Number(part(parts, 'year')),
      Number(part(parts, 'month')) - 1,
      Number(part(parts, 'day')),
      Number(part(parts, 'hour')),
      Number(part(parts, 'minute')),
      Number(part(parts, 'second')),
      0,
    );

    const delta = desiredAsUtc - renderedAsUtc;

    if (delta === 0) return guess;

    guess = new Date(guess.getTime() + delta);
  }

  throw new BadRequestException(
    `Unable to resolve local trading-day boundary in timezone ${timeZone}.`,
  );
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function parseLocalDate(localDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);

  if (!match) {
    throw new BadRequestException('Local trading date must be YYYY-MM-DD.');
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const found = parts.find((item) => item.type === type)?.value;

  if (!found) {
    throw new BadRequestException('Unable to resolve platform local time.');
  }

  return found;
}
