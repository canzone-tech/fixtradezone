import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import {
  CreateSupportTicketDto,
  SupportPageQueryDto,
  SupportReplyDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('categories')
  @Header('Cache-Control', 'no-store')
  listCategories() {
    return this.supportService.listActiveCategories();
  }

  @Get('tickets')
  @Header('Cache-Control', 'no-store')
  listMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SupportPageQueryDto,
  ) {
    return this.supportService.listMine(actor.id, query);
  }

  @Post('tickets')
  @Header('Cache-Control', 'no-store')
  createTicket(
    @Body() dto: CreateSupportTicketDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.createTicket(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get('tickets/:ticketId')
  @Header('Cache-Control', 'no-store')
  getMine(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.supportService.getMineTicket(actor.id, ticketId);
  }

  @Post('tickets/:ticketId/replies')
  @Header('Cache-Control', 'no-store')
  reply(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Body() dto: SupportReplyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.supportService.replyMine(
      ticketId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
