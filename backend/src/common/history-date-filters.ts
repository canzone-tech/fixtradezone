import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export interface HistoryDateFilterQuery {
  days?: number;
  fromDate?: string;
  toDate?: string;
}

/**
 * UTC calendar-day filters. No filter means complete history (legacy API).
 * Column names come from trusted Prisma.sql fragments, never request strings.
 */
export function historyDateFilter(
  column: Prisma.Sql,
  query: HistoryDateFilterQuery,
): Prisma.Sql {
  if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
    throw new BadRequestException('fromDate must not be after toDate.');
  }

  if (query.days !== undefined && (query.fromDate || query.toDate)) {
    throw new BadRequestException('Use either days or custom date bounds.');
  }

  if (query.days !== undefined) {
    if (![1, 2, 7, 30].includes(query.days)) {
      throw new BadRequestException('Unsupported history period.');
    }

    return Prisma.sql`
      AND DATE(${column}) >= DATE_SUB(
        UTC_DATE(),
        INTERVAL ${query.days - 1} DAY
      )
    `;
  }

  const from = query.fromDate
    ? Prisma.sql`AND DATE(${column}) >= CAST(${query.fromDate} AS DATE)`
    : Prisma.empty;
  const to = query.toDate
    ? Prisma.sql`AND DATE(${column}) <= CAST(${query.toDate} AS DATE)`
    : Prisma.empty;

  return Prisma.sql`${from} ${to}`;
}
