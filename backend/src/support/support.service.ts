import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { CommunicationService } from '../communication/communication.service';
import type { ManagedEmailContentKey } from '../communication/communication.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminSupportTicketQueryDto,
  AssignSupportTicketDto,
  ChangeSupportTicketStatusDto,
  CreateSupportCategoryDto,
  CreateSupportTicketDto,
  InternalSupportNoteDto,
  SupportPageQueryDto,
  SupportReplyDto,
  UpdateSupportCategoryDto,
} from './dto/support.dto';
import {
  canTransitionSupportStatus,
  type SupportEntryType,
  type SupportTicketStatus,
  USER_REPLYABLE_SUPPORT_STATUSES,
} from './support.constants';

type CountValue = bigint | number | string | Prisma.Decimal;

interface CountRow {
  total: CountValue;
}

interface SupportCategoryRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean | number;
  sortOrder: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SupportTicketRow {
  id: string;
  ticketNumber: string;
  userId: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  subject: string;
  status: SupportTicketStatus;
  assignedToUserId: string | null;
  lastActivityAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userUsername: string;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  assignedUsername: string | null;
  assignedEmail: string | null;
}

interface SupportEntryRow {
  id: string;
  ticketId: string;
  type: SupportEntryType;
  authorUserId: string | null;
  body: string | null;
  metadata: unknown;
  createdAt: Date;
  authorUsername: string | null;
  authorEmail: string | null;
}

interface AssignableStaffRow {
  id: string;
  username: string;
  email: string | null;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly communication: CommunicationService,
    private readonly config: ConfigService,
  ) {}

  async listActiveCategories() {
    const rows = await this.prisma.$queryRaw<SupportCategoryRow[]>(Prisma.sql`
      SELECT *
      FROM support_ticket_categories
      WHERE isActive = TRUE
      ORDER BY sortOrder ASC, name ASC, id ASC
    `);

    return { categories: rows.map((row) => this.serializeCategory(row)) };
  }

  async listAdminCategories() {
    const rows = await this.prisma.$queryRaw<SupportCategoryRow[]>(Prisma.sql`
      SELECT *
      FROM support_ticket_categories
      ORDER BY isActive DESC, sortOrder ASC, name ASC, id ASC
    `);

    return { categories: rows.map((row) => this.serializeCategory(row)) };
  }

  async listAssignableStaff() {
    const rows = await this.prisma.$queryRaw<AssignableStaffRow[]>(Prisma.sql`
      SELECT DISTINCT u.id, u.username, u.email
      FROM users u
      INNER JOIN user_roles ur ON ur.userId = u.id
      INNER JOIN roles r ON r.id = ur.roleId AND r.status = 'ACTIVE'
      WHERE u.status IN ('ACTIVE', 'RESTRICTED')
        AND r.name IN ('SUPER_ADMIN', 'ADMIN')
      ORDER BY u.username ASC, u.id ASC
    `);

    return { assignees: rows };
  }

  async createCategory(
    dto: CreateSupportCategoryDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const code = dto.code.trim().toUpperCase();
    const name = this.visibleText(dto.name, 'Category name');
    const description = dto.description?.trim() || null;

    const existing = await this.findCategoryByCode(this.prisma, code);
    if (existing) {
      throw new BadRequestException('Support category code already exists.');
    }

    const id = randomUUID();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_categories (
          id, code, name, description, isActive, sortOrder,
          createdByUserId, updatedByUserId, createdAt, updatedAt
        ) VALUES (
          ${id}, ${code}, ${name}, ${description}, TRUE, ${dto.sortOrder ?? 100},
          ${actor.id}, ${actor.id}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'SupportTicketCategory',
          entityId: id,
          description: 'Support ticket category created.',
          metadata: { code, name, sortOrder: dto.sortOrder ?? 100 },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    const category = await this.findCategoryById(this.prisma, id);
    if (!category)
      throw new Error('Support category insert did not read back.');
    return { category: this.serializeCategory(category) };
  }

  async updateCategory(
    categoryId: string,
    dto: UpdateSupportCategoryDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const current = await this.findCategoryById(this.prisma, categoryId);
    if (!current)
      throw new NotFoundException('Support category was not found.');

    const name =
      dto.name === undefined
        ? current.name
        : this.visibleText(dto.name, 'Category name');
    const description =
      dto.description === undefined
        ? current.description
        : dto.description.trim() || null;
    const isActive = dto.isActive ?? Boolean(current.isActive);
    const sortOrder = dto.sortOrder ?? current.sortOrder;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE support_ticket_categories
        SET
          name = ${name},
          description = ${description},
          isActive = ${isActive},
          sortOrder = ${sortOrder},
          updatedByUserId = ${actor.id},
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${categoryId}
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SupportTicketCategory',
          entityId: categoryId,
          description: 'Support ticket category updated.',
          metadata: {
            code: current.code,
            before: {
              name: current.name,
              description: current.description,
              isActive: Boolean(current.isActive),
              sortOrder: current.sortOrder,
            },
            after: { name, description, isActive, sortOrder },
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    const category = await this.findCategoryById(this.prisma, categoryId);
    if (!category)
      throw new Error('Support category update did not read back.');
    return { category: this.serializeCategory(category) };
  }

  async listMine(userId: string, query: SupportPageQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<SupportTicketRow[]>(Prisma.sql`
        ${this.ticketSelectSql()}
        WHERE t.userId = ${userId}
        ORDER BY t.lastActivityAt DESC, t.id DESC
        LIMIT ${query.limit} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM support_tickets t
        WHERE t.userId = ${userId}
      `),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      tickets: rows.map((row) => this.serializeTicket(row)),
    };
  }

  async createTicket(
    dto: CreateSupportTicketDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const subject = this.visibleText(dto.subject, 'Ticket subject');
    const message = this.visibleText(dto.message, 'Ticket message');
    const category = await this.findCategoryById(this.prisma, dto.categoryId);

    if (!category || !category.isActive) {
      throw new BadRequestException('Select an active support category.');
    }

    const ticketId = randomUUID();
    const entryId = randomUUID();
    const ticketNumber = this.generateTicketNumber();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_tickets (
          id, ticketNumber, userId, categoryId, categoryCode, categoryName,
          subject, status, assignedToUserId, lastActivityAt,
          resolvedAt, closedAt, createdAt, updatedAt
        ) VALUES (
          ${ticketId}, ${ticketNumber}, ${actor.id}, ${category.id},
          ${category.code}, ${category.name}, ${subject}, 'OPEN', NULL,
          CURRENT_TIMESTAMP(3), NULL, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_entries (
          id, ticketId, type, authorUserId, body, metadata, createdAt
        ) VALUES (
          ${entryId}, ${ticketId}, 'USER_REPLY', ${actor.id}, ${message}, NULL,
          CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'SupportTicket',
          entityId: ticketId,
          description: 'Support ticket created.',
          metadata: {
            ticketNumber,
            categoryId: category.id,
            categoryCode: category.code,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    const result = await this.getMineTicket(actor.id, ticketId);
    void this.notifyTicketCreated(result.ticket);
    return result;
  }

  async getMineTicket(userId: string, ticketId: string) {
    const ticket = await this.findTicket(this.prisma, ticketId, userId);
    if (!ticket) throw new NotFoundException('Support ticket was not found.');

    const entries = await this.listEntries(ticketId, false);
    return { ticket: this.serializeTicket(ticket), entries };
  }

  async replyMine(
    ticketId: string,
    dto: SupportReplyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const message = this.visibleText(dto.message, 'Reply');
    const current = await this.findTicket(this.prisma, ticketId, actor.id);
    if (!current) throw new NotFoundException('Support ticket was not found.');

    if (!USER_REPLYABLE_SUPPORT_STATUSES.includes(current.status)) {
      throw new BadRequestException(
        'Resolved or closed tickets cannot receive USER replies.',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_entries (
          id, ticketId, type, authorUserId, body, metadata, createdAt
        ) VALUES (
          ${randomUUID()}, ${ticketId}, 'USER_REPLY', ${actor.id}, ${message}, NULL,
          CURRENT_TIMESTAMP(3)
        )
      `);

      if (current.status === 'WAITING_FOR_USER') {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE support_tickets
          SET status = 'IN_PROGRESS', lastActivityAt = CURRENT_TIMESTAMP(3),
              updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${ticketId} AND userId = ${actor.id}
        `);
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO support_ticket_entries (
            id, ticketId, type, authorUserId, body, metadata, createdAt
          ) VALUES (
            ${randomUUID()}, ${ticketId}, 'STATUS_CHANGE', ${actor.id}, NULL,
            ${JSON.stringify({ fromStatus: 'WAITING_FOR_USER', toStatus: 'IN_PROGRESS', source: 'USER_REPLY' })},
            CURRENT_TIMESTAMP(3)
          )
        `);
      } else {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE support_tickets
          SET lastActivityAt = CURRENT_TIMESTAMP(3), updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${ticketId} AND userId = ${actor.id}
        `);
      }

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SupportTicket',
          entityId: ticketId,
          description: 'USER replied to own support ticket.',
          metadata: { ticketNumber: current.ticketNumber },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return this.getMineTicket(actor.id, ticketId);
  }

  async listAdminTickets(query: AdminSupportTicketQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const statusFilter = query.status
      ? Prisma.sql`AND t.status = ${query.status}`
      : Prisma.empty;
    const categoryFilter = query.categoryId
      ? Prisma.sql`AND t.categoryId = ${query.categoryId}`
      : Prisma.empty;
    const userFilter = query.userId
      ? Prisma.sql`AND t.userId = ${query.userId}`
      : Prisma.empty;
    const assigneeFilter = query.assignedToUserId
      ? Prisma.sql`AND t.assignedToUserId = ${query.assignedToUserId}`
      : Prisma.empty;
    const search = query.search?.trim() || null;
    const searchPattern = search ? `%${search}%` : null;
    const searchFilter = searchPattern
      ? Prisma.sql`AND (
          t.ticketNumber LIKE ${searchPattern}
          OR t.subject LIKE ${searchPattern}
          OR u.username LIKE ${searchPattern}
          OR u.email LIKE ${searchPattern}
        )`
      : Prisma.empty;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<SupportTicketRow[]>(Prisma.sql`
        ${this.ticketSelectSql()}
        WHERE 1 = 1
          ${statusFilter}
          ${categoryFilter}
          ${userFilter}
          ${assigneeFilter}
          ${searchFilter}
        ORDER BY t.lastActivityAt DESC, t.id DESC
        LIMIT ${query.limit} OFFSET ${skip}
      `),
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM support_tickets t
        INNER JOIN users u ON u.id = t.userId
        WHERE 1 = 1
          ${statusFilter}
          ${categoryFilter}
          ${userFilter}
          ${assigneeFilter}
          ${searchFilter}
      `),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total: this.countNumber(counts[0]?.total),
      tickets: rows.map((row) => this.serializeTicket(row)),
    };
  }

  async getAdminTicket(ticketId: string) {
    const ticket = await this.findTicket(this.prisma, ticketId);
    if (!ticket) throw new NotFoundException('Support ticket was not found.');
    return {
      ticket: this.serializeTicket(ticket),
      entries: await this.listEntries(ticketId, true),
    };
  }

  async replyAsStaff(
    ticketId: string,
    dto: SupportReplyDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const message = this.visibleText(dto.message, 'Reply');
    const current = await this.findTicket(this.prisma, ticketId);
    if (!current) throw new NotFoundException('Support ticket was not found.');
    if (current.status === 'RESOLVED' || current.status === 'CLOSED') {
      throw new BadRequestException(
        'Reopen a resolved ticket before replying. Closed tickets are terminal.',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      if (current.status === 'OPEN') {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE support_tickets
          SET status = 'IN_PROGRESS', lastActivityAt = CURRENT_TIMESTAMP(3),
              updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${ticketId}
        `);
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO support_ticket_entries (
            id, ticketId, type, authorUserId, body, metadata, createdAt
          ) VALUES (
            ${randomUUID()}, ${ticketId}, 'STATUS_CHANGE', ${actor.id}, NULL,
            ${JSON.stringify({ fromStatus: 'OPEN', toStatus: 'IN_PROGRESS', source: 'STAFF_REPLY' })},
            CURRENT_TIMESTAMP(3)
          )
        `);
      } else {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE support_tickets
          SET lastActivityAt = CURRENT_TIMESTAMP(3), updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${ticketId}
        `);
      }

      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_entries (
          id, ticketId, type, authorUserId, body, metadata, createdAt
        ) VALUES (
          ${randomUUID()}, ${ticketId}, 'STAFF_REPLY', ${actor.id}, ${message}, NULL,
          CURRENT_TIMESTAMP(3)
        )
      `);

      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SupportTicket',
          entityId: ticketId,
          description: 'Support staff replied to a ticket.',
          metadata: { ticketNumber: current.ticketNumber },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    const result = await this.getAdminTicket(ticketId);
    void this.notifyStaffReply(result.ticket);
    return result;
  }

  async assignTicket(
    ticketId: string,
    dto: AssignSupportTicketDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const current = await this.findTicket(this.prisma, ticketId);
    if (!current) throw new NotFoundException('Support ticket was not found.');
    if (current.status === 'CLOSED') {
      throw new BadRequestException('Closed tickets are terminal.');
    }

    const nextAssigneeId = dto.assignedToUserId ?? null;
    let assignee: AssignableStaffRow | null = null;
    if (nextAssigneeId) {
      assignee = await this.findAssignableStaff(nextAssigneeId);
      if (!assignee) {
        throw new BadRequestException(
          'Assignee must have an active ADMIN or SUPER_ADMIN role.',
        );
      }
    }

    if (current.assignedToUserId === nextAssigneeId) {
      return this.getAdminTicket(ticketId);
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE support_tickets
        SET assignedToUserId = ${nextAssigneeId}, updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${ticketId}
      `);
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_entries (
          id, ticketId, type, authorUserId, body, metadata, createdAt
        ) VALUES (
          ${randomUUID()}, ${ticketId}, 'ASSIGNMENT_CHANGE', ${actor.id}, NULL,
          ${JSON.stringify({ fromUserId: current.assignedToUserId, toUserId: nextAssigneeId })},
          CURRENT_TIMESTAMP(3)
        )
      `);
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SupportTicket',
          entityId: ticketId,
          description: nextAssigneeId
            ? 'Support ticket assigned.'
            : 'Support ticket unassigned.',
          metadata: {
            ticketNumber: current.ticketNumber,
            fromUserId: current.assignedToUserId,
            toUserId: nextAssigneeId,
            toUsername: assignee?.username ?? null,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return this.getAdminTicket(ticketId);
  }

  async changeStatus(
    ticketId: string,
    dto: ChangeSupportTicketStatusDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const current = await this.findTicket(this.prisma, ticketId);
    if (!current) throw new NotFoundException('Support ticket was not found.');
    if (current.status === dto.status) {
      throw new BadRequestException(
        'Support ticket is already in that status.',
      );
    }
    if (!canTransitionSupportStatus(current.status, dto.status)) {
      throw new BadRequestException(
        `Support ticket cannot move from ${current.status} to ${dto.status}.`,
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE support_tickets
        SET
          status = ${dto.status},
          resolvedAt = CASE
            WHEN ${dto.status} = 'RESOLVED' THEN CURRENT_TIMESTAMP(3)
            WHEN ${dto.status} = 'IN_PROGRESS' THEN NULL
            ELSE resolvedAt
          END,
          closedAt = CASE
            WHEN ${dto.status} = 'CLOSED' THEN CURRENT_TIMESTAMP(3)
            ELSE NULL
          END,
          lastActivityAt = CURRENT_TIMESTAMP(3),
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${ticketId}
      `);
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_entries (
          id, ticketId, type, authorUserId, body, metadata, createdAt
        ) VALUES (
          ${randomUUID()}, ${ticketId}, 'STATUS_CHANGE', ${actor.id}, NULL,
          ${JSON.stringify({ fromStatus: current.status, toStatus: dto.status, source: 'ADMIN_ACTION' })},
          CURRENT_TIMESTAMP(3)
        )
      `);
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'UPDATE',
          entityType: 'SupportTicket',
          entityId: ticketId,
          description: 'Support ticket status changed.',
          metadata: {
            ticketNumber: current.ticketNumber,
            fromStatus: current.status,
            toStatus: dto.status,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    const result = await this.getAdminTicket(ticketId);
    void this.notifyStatusChanged(result.ticket);
    return result;
  }

  async addInternalNote(
    ticketId: string,
    dto: InternalSupportNoteDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const message = this.visibleText(dto.message, 'Internal note');
    const current = await this.findTicket(this.prisma, ticketId);
    if (!current) throw new NotFoundException('Support ticket was not found.');
    if (current.status === 'CLOSED') {
      throw new BadRequestException('Closed tickets are terminal.');
    }

    const entryId = randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO support_ticket_entries (
          id, ticketId, type, authorUserId, body, metadata, createdAt
        ) VALUES (
          ${entryId}, ${ticketId}, 'INTERNAL_NOTE', ${actor.id}, ${message}, NULL,
          CURRENT_TIMESTAMP(3)
        )
      `);
      await transaction.$executeRaw(Prisma.sql`
        UPDATE support_tickets
        SET lastActivityAt = CURRENT_TIMESTAMP(3), updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${ticketId}
      `);
      await transaction.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'CREATE',
          entityType: 'SupportTicketEntry',
          entityId: entryId,
          description: 'Internal support note added.',
          metadata: { ticketId, ticketNumber: current.ticketNumber },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });

    return this.getAdminTicket(ticketId);
  }

  private ticketSelectSql() {
    return Prisma.sql`
      SELECT
        t.id, t.ticketNumber, t.userId, t.categoryId, t.categoryCode,
        t.categoryName, t.subject, t.status, t.assignedToUserId,
        t.lastActivityAt, t.resolvedAt, t.closedAt, t.createdAt, t.updatedAt,
        u.username AS userUsername,
        u.email AS userEmail,
        u.firstName AS userFirstName,
        u.lastName AS userLastName,
        a.username AS assignedUsername,
        a.email AS assignedEmail
      FROM support_tickets t
      INNER JOIN users u ON u.id = t.userId
      LEFT JOIN users a ON a.id = t.assignedToUserId
    `;
  }

  private async findTicket(
    client: PrismaService | Prisma.TransactionClient,
    ticketId: string,
    userId?: string,
  ) {
    const ownerFilter = userId
      ? Prisma.sql`AND t.userId = ${userId}`
      : Prisma.empty;
    const rows = await client.$queryRaw<SupportTicketRow[]>(Prisma.sql`
      ${this.ticketSelectSql()}
      WHERE t.id = ${ticketId}
        ${ownerFilter}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async listEntries(ticketId: string, includeInternal: boolean) {
    const internalFilter = includeInternal
      ? Prisma.empty
      : Prisma.sql`AND e.type NOT IN ('INTERNAL_NOTE', 'ASSIGNMENT_CHANGE')`;
    const rows = await this.prisma.$queryRaw<SupportEntryRow[]>(Prisma.sql`
      SELECT
        e.id, e.ticketId, e.type, e.authorUserId, e.body, e.metadata, e.createdAt,
        u.username AS authorUsername,
        u.email AS authorEmail
      FROM support_ticket_entries e
      LEFT JOIN users u ON u.id = e.authorUserId
      WHERE e.ticketId = ${ticketId}
        ${internalFilter}
      ORDER BY e.createdAt ASC, e.id ASC
    `);
    return rows.map((row) => this.serializeEntry(row, includeInternal));
  }

  private async findCategoryById(
    client: PrismaService | Prisma.TransactionClient,
    categoryId: string,
  ) {
    const rows = await client.$queryRaw<SupportCategoryRow[]>(Prisma.sql`
      SELECT * FROM support_ticket_categories WHERE id = ${categoryId} LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async findCategoryByCode(
    client: PrismaService | Prisma.TransactionClient,
    code: string,
  ) {
    const rows = await client.$queryRaw<SupportCategoryRow[]>(Prisma.sql`
      SELECT * FROM support_ticket_categories WHERE code = ${code} LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async findAssignableStaff(userId: string) {
    const rows = await this.prisma.$queryRaw<AssignableStaffRow[]>(Prisma.sql`
      SELECT DISTINCT u.id, u.username, u.email
      FROM users u
      INNER JOIN user_roles ur ON ur.userId = u.id
      INNER JOIN roles r ON r.id = ur.roleId AND r.status = 'ACTIVE'
      WHERE u.id = ${userId}
        AND u.status IN ('ACTIVE', 'RESTRICTED')
        AND r.name IN ('SUPER_ADMIN', 'ADMIN')
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private serializeCategory(row: SupportCategoryRow) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: Boolean(row.isActive),
      sortOrder: Number(row.sortOrder),
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeTicket(row: SupportTicketRow) {
    return {
      id: row.id,
      ticketNumber: row.ticketNumber,
      userId: row.userId,
      categoryId: row.categoryId,
      categoryCode: row.categoryCode,
      categoryName: row.categoryName,
      subject: row.subject,
      status: row.status,
      assignedToUserId: row.assignedToUserId,
      assignedTo: row.assignedToUserId
        ? {
            id: row.assignedToUserId,
            username: row.assignedUsername,
            email: row.assignedEmail,
          }
        : null,
      user: {
        id: row.userId,
        username: row.userUsername,
        email: row.userEmail,
        firstName: row.userFirstName,
        lastName: row.userLastName,
      },
      lastActivityAt: row.lastActivityAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeEntry(row: SupportEntryRow, includeInternal: boolean) {
    const publicStaffIdentity =
      !includeInternal &&
      (row.type === 'STAFF_REPLY' || row.type === 'STATUS_CHANGE');

    return {
      id: row.id,
      ticketId: row.ticketId,
      type: row.type,
      authorUserId: row.authorUserId,
      author: row.authorUserId
        ? {
            id: row.authorUserId,
            username: publicStaffIdentity ? 'Support' : row.authorUsername,
            email: includeInternal ? row.authorEmail : null,
          }
        : null,
      body: row.body,
      metadata: this.normalizeMetadata(row.metadata),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private normalizeMetadata(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  private countNumber(value: CountValue | undefined) {
    if (value === undefined || value === null) return 0;
    return Number(value.toString());
  }

  private visibleText(value: string, label: string) {
    const text = value.trim();
    if (!text) {
      throw new BadRequestException(`${label} must contain visible text.`);
    }
    return text;
  }

  private generateTicketNumber() {
    return `FTZ-${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  }

  private getTicketUrl() {
    const appUrl = (
      this.config.get<string>('PUBLIC_APP_URL') ?? 'https://localhost:3001'
    ).replace(/\/+$/, '');
    return `${appUrl}/user/support`;
  }

  private displayName(ticket: ReturnType<SupportService['serializeTicket']>) {
    const name = [ticket.user.firstName, ticket.user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return name || ticket.user.username || 'FixTradeZone User';
  }

  private async notifyTicketCreated(
    ticket: ReturnType<SupportService['serializeTicket']>,
  ) {
    await this.safeNotification(
      ticket,
      'Support ticket created',
      `${ticket.ticketNumber} has been created and is currently OPEN.`,
    );
    await this.safeEmail(ticket, 'SUPPORT_TICKET_CREATED', {
      displayName: this.displayName(ticket),
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      status: ticket.status,
      ticketUrl: this.getTicketUrl(),
    });
  }

  private async notifyStaffReply(
    ticket: ReturnType<SupportService['serializeTicket']>,
  ) {
    await this.safeNotification(
      ticket,
      'Support replied to your ticket',
      `${ticket.ticketNumber} has a new support reply.`,
    );
    await this.safeEmail(ticket, 'SUPPORT_TICKET_REPLY', {
      displayName: this.displayName(ticket),
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      ticketUrl: this.getTicketUrl(),
    });
  }

  private async notifyStatusChanged(
    ticket: ReturnType<SupportService['serializeTicket']>,
  ) {
    await this.safeNotification(
      ticket,
      'Support ticket status updated',
      `${ticket.ticketNumber} is now ${ticket.status.replaceAll('_', ' ')}.`,
    );
    await this.safeEmail(ticket, 'SUPPORT_TICKET_STATUS_CHANGED', {
      displayName: this.displayName(ticket),
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      status: ticket.status,
      ticketUrl: this.getTicketUrl(),
    });
  }

  private async safeNotification(
    ticket: ReturnType<SupportService['serializeTicket']>,
    title: string,
    message: string,
  ) {
    try {
      await this.notifications.createEventNotification({
        userId: ticket.userId,
        category: 'SUPPORT',
        title,
        message,
        sourceType: 'SUPPORT_TICKET',
        sourceId: ticket.id,
      });
    } catch (error) {
      this.logger.warn(
        `Support notification failed for ${ticket.ticketNumber}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async safeEmail(
    ticket: ReturnType<SupportService['serializeTicket']>,
    contentKey: ManagedEmailContentKey,
    values: Record<string, string>,
  ) {
    if (!ticket.user.email) return;

    try {
      await this.communication.sendEmail({
        to: ticket.user.email,
        subject: 'FixTradeZone support update',
        text: `Support update for ${ticket.ticketNumber}.`,
        managedTemplate: {
          contentKey,
          values,
          actionUrl: this.getTicketUrl(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Support email failed for ${ticket.ticketNumber}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
