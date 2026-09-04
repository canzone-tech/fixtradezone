import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  type AdminNotificationQueryDto,
  type CreateAdminNotificationDto,
  type NotificationPageQueryDto,
} from './dto/notification.dto';
import {
  NOTIFICATION_AUDIT_OPERATION,
  type NotificationCategory,
} from './notifications.constants';

type CountValue = bigint | number | string | Prisma.Decimal;

interface CountRow {
  total: CountValue;
}

interface NotificationRow {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  sourceType: string | null;
  sourceId: string | null;
  createdByUserId: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminNotificationRow extends NotificationRow {
  username: string;
  email: string | null;
}

interface UserRow {
  id: string;
  username: string;
  email: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: string, query: NotificationPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const unreadFilter = query.unreadOnly
      ? Prisma.sql`AND readAt IS NULL`
      : Prisma.empty;

    const [rows, counts, unreadCounts] = await Promise.all([
      this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
        SELECT *
        FROM user_notifications
        WHERE userId = ${userId}
          ${unreadFilter}
        ORDER BY createdAt DESC, id DESC
        LIMIT ${query.limit} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM user_notifications
        WHERE userId = ${userId}
          ${unreadFilter}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM user_notifications
        WHERE userId = ${userId}
          AND readAt IS NULL
      `),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      unreadTotal: this.countNumber(unreadCounts[0]?.total),
      notifications: rows.map((row) => this.snapshot(row)),
    };
  }

  async markRead(userId: string, notificationId: string) {
    const before = await this.findMine(userId, notificationId);

    if (!before) {
      throw new NotFoundException('Notification was not found.');
    }

    if (!before.readAt) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE user_notifications
        SET
          readAt = CURRENT_TIMESTAMP(3),
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${notificationId}
          AND userId = ${userId}
          AND readAt IS NULL
      `);
    }

    const notification = await this.findMine(userId, notificationId);

    if (!notification) {
      throw new NotFoundException('Notification was not found.');
    }

    return {
      notification: this.snapshot(notification),
    };
  }

  async markAllRead(userId: string) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE user_notifications
      SET
        readAt = CURRENT_TIMESTAMP(3),
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE userId = ${userId}
        AND readAt IS NULL
    `);

    return {
      updated: Number(updated),
    };
  }

  async listAdmin(query: AdminNotificationQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const recipientFilter = query.recipientUserId
      ? Prisma.sql`AND n.userId = ${query.recipientUserId}`
      : Prisma.empty;
    const categoryFilter = query.category
      ? Prisma.sql`AND n.category = ${query.category}`
      : Prisma.empty;
    const unreadFilter = query.unreadOnly
      ? Prisma.sql`AND n.readAt IS NULL`
      : Prisma.empty;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<AdminNotificationRow[]>(Prisma.sql`
        SELECT
          n.*,
          u.username,
          u.email
        FROM user_notifications n
        INNER JOIN users u ON u.id = n.userId
        WHERE 1 = 1
          ${recipientFilter}
          ${categoryFilter}
          ${unreadFilter}
        ORDER BY n.createdAt DESC, n.id DESC
        LIMIT ${query.limit} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM user_notifications n
        WHERE 1 = 1
          ${recipientFilter}
          ${categoryFilter}
          ${unreadFilter}
      `),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      notifications: rows.map((row) => ({
        ...this.snapshot(row),
        username: row.username,
        email: row.email,
      })),
    };
  }

  async createAdminNotification(
    dto: CreateAdminNotificationDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const title = dto.title.trim();
    const message = dto.message.trim();

    if (!title || !message) {
      throw new BadRequestException(
        'Notification title and message must contain visible text.',
      );
    }

    if (dto.audience === 'USER' && !dto.recipientUserId) {
      throw new BadRequestException(
        'recipientUserId is required for USER audience.',
      );
    }

    if (dto.audience === 'ALL_USERS' && dto.recipientUserId) {
      throw new BadRequestException(
        'recipientUserId must not be supplied for ALL_USERS audience.',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      let recipientCount = 0;
      let notificationId: string | null = null;
      let targetedUser: UserRow | null = null;

      if (dto.audience === 'USER') {
        const users = await transaction.$queryRaw<UserRow[]>(Prisma.sql`
          SELECT u.id, u.username, u.email
          FROM users u
          WHERE u.id = ${dto.recipientUserId!}
            AND u.status IN ('ACTIVE', 'RESTRICTED')
            AND EXISTS (
              SELECT 1
              FROM user_roles ur
              INNER JOIN roles r ON r.id = ur.roleId
              WHERE ur.userId = u.id
                AND r.name = 'USER'
                AND r.status = 'ACTIVE'
            )
            AND NOT EXISTS (
              SELECT 1
              FROM user_roles aur
              INNER JOIN roles ar ON ar.id = aur.roleId
              WHERE aur.userId = u.id
                AND ar.name IN ('ADMIN', 'SUPER_ADMIN')
            )
          LIMIT 1
        `);

        targetedUser = users[0] ?? null;

        if (!targetedUser) {
          throw new NotFoundException(
            'Eligible standard USER notification recipient was not found.',
          );
        }

        notificationId = randomUUID();

        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO user_notifications (
            id, userId, category, title, message,
            sourceType, sourceId, createdByUserId,
            readAt, createdAt, updatedAt
          ) VALUES (
            ${notificationId}, ${targetedUser.id}, ${dto.category},
            ${title}, ${message},
            'ADMIN_TARGETED', NULL, ${actor.id},
            NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
          )
        `);

        recipientCount = 1;
      } else {
        recipientCount = Number(
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO user_notifications (
              id, userId, category, title, message,
              sourceType, sourceId, createdByUserId,
              readAt, createdAt, updatedAt
            )
            SELECT
              UUID(), u.id, ${dto.category}, ${title}, ${message},
              'ADMIN_BROADCAST', NULL, ${actor.id},
              NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
            FROM users u
            WHERE u.status IN ('ACTIVE', 'RESTRICTED')
              AND EXISTS (
                SELECT 1
                FROM user_roles ur
                INNER JOIN roles r ON r.id = ur.roleId
                WHERE ur.userId = u.id
                  AND r.name = 'USER'
                  AND r.status = 'ACTIVE'
              )
              AND NOT EXISTS (
                SELECT 1
                FROM user_roles aur
                INNER JOIN roles ar ON ar.id = aur.roleId
                WHERE aur.userId = u.id
                  AND ar.name IN ('ADMIN', 'SUPER_ADMIN')
              )
          `),
        );
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'UserNotification',
          entityId: notificationId,
          description:
            dto.audience === 'USER'
              ? 'Targeted in-app user notification created.'
              : 'Broadcast in-app user notification created.',
          metadata: {
            source: 'NOTIFICATIONS',
            operation: NOTIFICATION_AUDIT_OPERATION,
            audience: dto.audience,
            category: dto.category,
            recipientUserId: targetedUser?.id ?? null,
            recipientCount,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      const notification = notificationId
        ? await this.findById(transaction, notificationId)
        : null;

      return {
        created: true,
        audience: dto.audience,
        recipientCount,
        notification: notification ? this.snapshot(notification) : null,
      };
    });
  }

  private async findMine(userId: string, notificationId: string) {
    const rows = await this.prisma.$queryRaw<NotificationRow[]>(Prisma.sql`
      SELECT *
      FROM user_notifications
      WHERE id = ${notificationId}
        AND userId = ${userId}
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private async findById(
    client: Prisma.TransactionClient,
    notificationId: string,
  ) {
    const rows = await client.$queryRaw<NotificationRow[]>(Prisma.sql`
      SELECT *
      FROM user_notifications
      WHERE id = ${notificationId}
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private snapshot(row: NotificationRow) {
    return {
      id: row.id,
      userId: row.userId,
      category: row.category,
      title: row.title,
      message: row.message,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdByUserId: row.createdByUserId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private countNumber(value: CountValue | undefined): number {
    if (value === undefined || value === null) return 0;
    return Number(value.toString());
  }
}
