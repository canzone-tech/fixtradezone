import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  type SupportTicketStatus,
  USER_REPLYABLE_SUPPORT_STATUSES,
} from './support.constants';

export const SUPPORT_ATTACHMENT_MAX_FILES = 3;
export const SUPPORT_ATTACHMENT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export interface SupportUploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface SupportTicketAccessRow {
  id: string;
  ticketNumber: string;
  userId: string;
  status: SupportTicketStatus;
}

interface SupportAttachmentRow {
  id: string;
  ticketId: string;
  uploadedByUserId: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: bigint | number | string;
  sha256: string;
  createdAt: Date;
  ticketUserId: string;
  uploaderUsername: string;
  uploaderEmail: string | null;
}

interface DetectedFileType {
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  extension: 'jpg' | 'png' | 'pdf';
  allowedExtensions: readonly string[];
}

interface PreparedAttachment {
  id: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  absolutePath: string;
  buffer: Buffer;
}

@Injectable()
export class SupportAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async listForUser(ticketId: string, userId: string) {
    await this.requireTicket(ticketId, userId);
    const rows = await this.listRows(ticketId);
    return {
      attachments: rows.map((row) => this.serializeUserAttachment(row)),
    };
  }

  async listForAdmin(ticketId: string) {
    await this.requireTicket(ticketId);
    const rows = await this.listRows(ticketId);
    return {
      attachments: rows.map((row) => this.serializeAdminAttachment(row)),
    };
  }

  async uploadForUser(
    ticketId: string,
    actor: AuthenticatedUser,
    files: SupportUploadedFile[] | undefined,
    context: RequestContext = {},
  ) {
    const ticket = await this.requireTicket(ticketId, actor.id);
    this.requireAttachmentWritable(ticket.status);
    await this.persistFiles(ticket, actor, files, context);
    return this.listForUser(ticketId, actor.id);
  }

  async uploadForAdmin(
    ticketId: string,
    actor: AuthenticatedUser,
    files: SupportUploadedFile[] | undefined,
    context: RequestContext = {},
  ) {
    const ticket = await this.requireTicket(ticketId);
    this.requireAttachmentWritable(ticket.status);
    await this.persistFiles(ticket, actor, files, context);
    return this.listForAdmin(ticketId);
  }

  async getDownloadForUser(
    ticketId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.requireTicket(ticketId, userId);
    const attachment = await this.findAttachment(ticketId, attachmentId);
    if (!attachment) {
      throw new NotFoundException('Support attachment was not found.');
    }
    return this.prepareDownload(attachment);
  }

  async getDownloadForAdmin(ticketId: string, attachmentId: string) {
    await this.requireTicket(ticketId);
    const attachment = await this.findAttachment(ticketId, attachmentId);
    if (!attachment) {
      throw new NotFoundException('Support attachment was not found.');
    }
    return this.prepareDownload(attachment);
  }

  private async persistFiles(
    ticket: SupportTicketAccessRow,
    actor: AuthenticatedUser,
    files: SupportUploadedFile[] | undefined,
    context: RequestContext,
  ) {
    const prepared = this.prepareFiles(ticket.id, files);
    const writtenPaths: string[] = [];

    try {
      for (const attachment of prepared) {
        await fs.mkdir(dirname(attachment.absolutePath), {
          recursive: true,
          mode: 0o700,
        });
        await fs.writeFile(attachment.absolutePath, attachment.buffer, {
          flag: 'wx',
          mode: 0o600,
        });
        writtenPaths.push(attachment.absolutePath);
      }

      await this.prisma.$transaction(async (transaction) => {
        for (const attachment of prepared) {
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO support_ticket_attachments (
              id, ticketId, uploadedByUserId, originalName, storageKey,
              mimeType, sizeBytes, sha256, createdAt
            ) VALUES (
              ${attachment.id}, ${ticket.id}, ${actor.id},
              ${attachment.originalName}, ${attachment.storageKey},
              ${attachment.mimeType}, ${attachment.sizeBytes}, ${attachment.sha256},
              CURRENT_TIMESTAMP(3)
            )
          `);

          await transaction.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'CREATE',
              entityType: 'SupportTicketAttachment',
              entityId: attachment.id,
              description: 'Support ticket attachment uploaded.',
              metadata: {
                ticketId: ticket.id,
                ticketNumber: ticket.ticketNumber,
                originalName: attachment.originalName,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                sha256: attachment.sha256,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
        }

        await transaction.$executeRaw(Prisma.sql`
          UPDATE support_tickets
          SET lastActivityAt = CURRENT_TIMESTAMP(3), updatedAt = CURRENT_TIMESTAMP(3)
          WHERE id = ${ticket.id}
        `);
      });
    } catch (error) {
      await Promise.all(
        writtenPaths.map((path) => fs.unlink(path).catch(() => undefined)),
      );
      throw error;
    }
  }

  private prepareFiles(
    ticketId: string,
    files: SupportUploadedFile[] | undefined,
  ): PreparedAttachment[] {
    if (!files || files.length === 0) {
      throw new BadRequestException('Select at least one attachment to upload.');
    }

    if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
      throw new BadRequestException(
        `A maximum of ${SUPPORT_ATTACHMENT_MAX_FILES} attachments can be uploaded at once.`,
      );
    }

    return files.map((file) => {
      const buffer = file.buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new BadRequestException('Attachment file content is empty.');
      }
      if (buffer.length > SUPPORT_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
        throw new BadRequestException('Each attachment must be 5 MB or smaller.');
      }

      const originalName = Array.from(basename(file.originalname ?? ''))
        .filter((character) => {
          const code = character.charCodeAt(0);
          return code > 31 && code !== 127;
        })
        .join('')
        .trim();
      if (!originalName || originalName.length > 255) {
        throw new BadRequestException('Attachment filename is invalid.');
      }

      const detected = this.detectFileType(buffer);
      if (!detected) {
        throw new BadRequestException(
          'Only genuine JPG, JPEG, PNG, and PDF files are allowed.',
        );
      }

      const originalExtension = extname(originalName).toLowerCase();
      if (!detected.allowedExtensions.includes(originalExtension)) {
        throw new BadRequestException(
          'Attachment extension does not match the uploaded file content.',
        );
      }

      const declaredMime = (file.mimetype ?? '').toLowerCase();
      if (
        declaredMime &&
        declaredMime !== 'application/octet-stream' &&
        declaredMime !== detected.mimeType
      ) {
        throw new BadRequestException(
          'Attachment MIME type does not match the uploaded file content.',
        );
      }

      const id = randomUUID();
      const storageKey = `${ticketId}/${id}.${detected.extension}`;
      const absolutePath = this.storagePath(storageKey);

      return {
        id,
        originalName,
        storageKey,
        mimeType: detected.mimeType,
        sizeBytes: buffer.length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        absolutePath,
        buffer,
      };
    });
  }

  private detectFileType(buffer: Buffer): DetectedFileType | null {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return {
        mimeType: 'image/png',
        extension: 'png',
        allowedExtensions: ['.png'],
      };
    }

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return {
        mimeType: 'image/jpeg',
        extension: 'jpg',
        allowedExtensions: ['.jpg', '.jpeg'],
      };
    }

    if (
      buffer.length >= 5 &&
      buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    ) {
      return {
        mimeType: 'application/pdf',
        extension: 'pdf',
        allowedExtensions: ['.pdf'],
      };
    }

    return null;
  }

  private requireAttachmentWritable(status: SupportTicketStatus) {
    if (!USER_REPLYABLE_SUPPORT_STATUSES.includes(status)) {
      throw new BadRequestException(
        'Resolved or closed tickets cannot receive attachments.',
      );
    }
  }

  private async requireTicket(ticketId: string, userId?: string) {
    const ownerFilter = userId
      ? Prisma.sql`AND userId = ${userId}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<SupportTicketAccessRow[]>(Prisma.sql`
      SELECT id, ticketNumber, userId, status
      FROM support_tickets
      WHERE id = ${ticketId} ${ownerFilter}
      LIMIT 1
    `);
    const ticket = rows[0];
    if (!ticket) {
      throw new NotFoundException('Support ticket was not found.');
    }
    return ticket;
  }

  private async listRows(ticketId: string) {
    return this.prisma.$queryRaw<SupportAttachmentRow[]>(Prisma.sql`
      SELECT
        a.id,
        a.ticketId,
        a.uploadedByUserId,
        a.originalName,
        a.storageKey,
        a.mimeType,
        a.sizeBytes,
        a.sha256,
        a.createdAt,
        t.userId AS ticketUserId,
        u.username AS uploaderUsername,
        u.email AS uploaderEmail
      FROM support_ticket_attachments a
      INNER JOIN support_tickets t ON t.id = a.ticketId
      INNER JOIN users u ON u.id = a.uploadedByUserId
      WHERE a.ticketId = ${ticketId}
      ORDER BY a.createdAt ASC, a.id ASC
    `);
  }

  private async findAttachment(ticketId: string, attachmentId: string) {
    const rows = await this.prisma.$queryRaw<SupportAttachmentRow[]>(Prisma.sql`
      SELECT
        a.id,
        a.ticketId,
        a.uploadedByUserId,
        a.originalName,
        a.storageKey,
        a.mimeType,
        a.sizeBytes,
        a.sha256,
        a.createdAt,
        t.userId AS ticketUserId,
        u.username AS uploaderUsername,
        u.email AS uploaderEmail
      FROM support_ticket_attachments a
      INNER JOIN support_tickets t ON t.id = a.ticketId
      INNER JOIN users u ON u.id = a.uploadedByUserId
      WHERE a.ticketId = ${ticketId} AND a.id = ${attachmentId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async prepareDownload(row: SupportAttachmentRow) {
    const absolutePath = this.storagePath(row.storageKey);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile() || stat.size !== Number(row.sizeBytes)) {
      throw new NotFoundException('Support attachment file is unavailable.');
    }

    return {
      path: absolutePath,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
    };
  }

  private storagePath(storageKey: string) {
    const root = this.storageRoot();
    const absolutePath = resolve(root, storageKey);
    if (!absolutePath.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('Attachment storage key is invalid.');
    }
    return absolutePath;
  }

  private storageRoot() {
    const configured = this.config
      .get<string>('SUPPORT_ATTACHMENT_STORAGE_DIR')
      ?.trim();
    return resolve(
      configured || resolve(process.cwd(), 'storage', 'support-attachments'),
    );
  }

  private serializeUserAttachment(row: SupportAttachmentRow) {
    const uploadedByLabel =
      row.uploadedByUserId === row.ticketUserId ? 'You' : 'Support';
    return {
      id: row.id,
      ticketId: row.ticketId,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      uploadedByLabel,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private serializeAdminAttachment(row: SupportAttachmentRow) {
    return {
      id: row.id,
      ticketId: row.ticketId,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes),
      uploadedBy: {
        id: row.uploadedByUserId,
        username: row.uploaderUsername,
        email: row.uploaderEmail,
      },
      sha256: row.sha256,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
