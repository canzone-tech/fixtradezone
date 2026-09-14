import { createReadStream } from 'node:fs';
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import {
  SUPPORT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SupportAttachmentService,
  type SupportUploadedFile,
} from './support-attachment.service';

const attachmentInterceptor = FilesInterceptor(
  'files',
  SUPPORT_ATTACHMENT_MAX_FILES,
  {
    limits: {
      files: SUPPORT_ATTACHMENT_MAX_FILES,
      fileSize: SUPPORT_ATTACHMENT_MAX_FILE_SIZE_BYTES,
    },
  },
);

function contentDisposition(filename: string): string {
  const fallback = filename
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function applyDownloadHeaders(
  response: Response,
  file: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  },
) {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Type', file.mimeType);
  response.setHeader('Content-Length', String(file.sizeBytes));
  response.setHeader(
    'Content-Disposition',
    contentDisposition(file.originalName),
  );
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

@Controller('support/tickets')
export class SupportAttachmentController {
  constructor(private readonly attachments: SupportAttachmentService) {}

  @Get(':ticketId/attachments')
  @Header('Cache-Control', 'no-store')
  list(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.listForUser(ticketId, actor.id);
  }

  @Post(':ticketId/attachments')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(attachmentInterceptor)
  upload(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @UploadedFiles() files: SupportUploadedFile[] | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.attachments.uploadForUser(
      ticketId,
      actor,
      files,
      getRequestContext(request),
    );
  }

  @Get(':ticketId/attachments/:attachmentId')
  async download(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.attachments.getDownloadForUser(
      ticketId,
      attachmentId,
      actor.id,
    );
    applyDownloadHeaders(response, file);
    return new StreamableFile(createReadStream(file.path));
  }
}

@Controller('admin/support/tickets')
export class AdminSupportAttachmentController {
  constructor(private readonly attachments: SupportAttachmentService) {}

  @Get(':ticketId/attachments')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_READ)
  list(@Param('ticketId', new ParseUUIDPipe()) ticketId: string) {
    return this.attachments.listForAdmin(ticketId);
  }

  @Post(':ticketId/attachments')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_REPLY)
  @UseInterceptors(attachmentInterceptor)
  upload(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @UploadedFiles() files: SupportUploadedFile[] | undefined,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.attachments.uploadForAdmin(
      ticketId,
      actor,
      files,
      getRequestContext(request),
    );
  }

  @Get(':ticketId/attachments/:attachmentId')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_READ)
  async download(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.attachments.getDownloadForAdmin(
      ticketId,
      attachmentId,
    );
    applyDownloadHeaders(response, file);
    return new StreamableFile(createReadStream(file.path));
  }
}
