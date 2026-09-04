import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { AuditLogQueryDto } from './dto/audit-log.dto';

interface CountRow {
  total: bigint | number | string;
}

interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  description: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  actorUsername: string | null;
  actorEmail: string | null;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogQueryDto) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from >= to) {
      throw new BadRequestException('Audit log from must be earlier than to.');
    }

    const skip = (query.page - 1) * query.limit;
    const entityType = query.entityType?.trim() || null;
    const entityId = query.entityId?.trim() || null;
    const search = query.search?.trim() || null;
    const searchPattern = search ? `%${search}%` : null;

    const actorFilter = query.actorUserId
      ? Prisma.sql`AND al.actorUserId = ${query.actorUserId}`
      : Prisma.empty;
    const actionFilter = query.action
      ? Prisma.sql`AND al.action = ${query.action}`
      : Prisma.empty;
    const entityTypeFilter = entityType
      ? Prisma.sql`AND al.entityType = ${entityType}`
      : Prisma.empty;
    const entityIdFilter = entityId
      ? Prisma.sql`AND al.entityId = ${entityId}`
      : Prisma.empty;
    const fromFilter = from
      ? Prisma.sql`AND al.createdAt >= ${from}`
      : Prisma.empty;
    const toFilter = to
      ? Prisma.sql`AND al.createdAt < ${to}`
      : Prisma.empty;
    const searchFilter = searchPattern
      ? Prisma.sql`AND (
          al.description LIKE ${searchPattern}
          OR al.entityType LIKE ${searchPattern}
          OR al.entityId LIKE ${searchPattern}
          OR u.username LIKE ${searchPattern}
          OR u.email LIKE ${searchPattern}
        )`
      : Prisma.empty;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<AuditLogRow[]>(Prisma.sql`
        SELECT
          al.id,
          al.actorUserId,
          al.action,
          al.entityType,
          al.entityId,
          al.description,
          al.metadata,
          al.ipAddress,
          al.userAgent,
          al.createdAt,
          u.username AS actorUsername,
          u.email AS actorEmail
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actorUserId
        WHERE 1 = 1
          ${actorFilter}
          ${actionFilter}
          ${entityTypeFilter}
          ${entityIdFilter}
          ${fromFilter}
          ${toFilter}
          ${searchFilter}
        ORDER BY al.createdAt DESC, al.id DESC
        LIMIT ${query.limit} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actorUserId
        WHERE 1 = 1
          ${actorFilter}
          ${actionFilter}
          ${entityTypeFilter}
          ${entityIdFilter}
          ${fromFilter}
          ${toFilter}
          ${searchFilter}
      `),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      filters: {
        actorUserId: query.actorUserId ?? null,
        action: query.action ?? null,
        entityType,
        entityId,
        search,
        from: from?.toISOString() ?? null,
        toExclusive: to?.toISOString() ?? null,
      },
      auditLogs: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actor: row.actorUserId
          ? {
              id: row.actorUserId,
              username: row.actorUsername,
              email: row.actorEmail,
            }
          : null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        description: row.description,
        metadata: this.normalizeMetadata(row.metadata),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private countNumber(value: bigint | number | string | undefined): number {
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return 0;
  }

  private normalizeMetadata(value: unknown): unknown {
    if (typeof value !== 'string') return value;

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
}
