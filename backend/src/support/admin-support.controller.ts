import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import {
  AdminSupportTicketQueryDto,
  AssignSupportTicketDto,
  ChangeSupportTicketStatusDto,
  CreateSupportCategoryDto,
  InternalSupportNoteDto,
  SupportReplyDto,
  UpdateSupportCategoryDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('categories')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_READ)
  listCategories() {
    return this.supportService.listAdminCategories();
  }

  @Post('categories')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_CATEGORIES_MANAGE)
  createCategory(
    @Body() dto: CreateSupportCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.createCategory(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch('categories/:categoryId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_CATEGORIES_MANAGE)
  updateCategory(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @Body() dto: UpdateSupportCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.updateCategory(
      categoryId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get('tickets')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_READ)
  listTickets(@Query() query: AdminSupportTicketQueryDto) {
    return this.supportService.listAdminTickets(query);
  }

  @Get('tickets/:ticketId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_READ)
  getTicket(@Param('ticketId', new ParseUUIDPipe()) ticketId: string) {
    return this.supportService.getAdminTicket(ticketId);
  }

  @Post('tickets/:ticketId/replies')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_REPLY)
  reply(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.replyAsStaff(
      ticketId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch('tickets/:ticketId/assignment')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_ASSIGN)
  assign(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: AssignSupportTicketDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.assignTicket(
      ticketId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch('tickets/:ticketId/status')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_STATUS_MANAGE)
  changeStatus(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: ChangeSupportTicketStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.changeStatus(
      ticketId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post('tickets/:ticketId/notes')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SUPPORT_TICKETS_NOTES_MANAGE)
  addInternalNote(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: InternalSupportNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.addInternalNote(
      ticketId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
