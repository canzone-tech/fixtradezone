import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationPageQueryDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  listMine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: NotificationPageQueryDto,
  ) {
    return this.notificationsService.listMine(actor.id, query);
  }

  @Patch(':notificationId/read')
  @Header('Cache-Control', 'no-store')
  markRead(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
  ) {
    return this.notificationsService.markRead(actor.id, notificationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  markAllRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAllRead(actor.id);
  }
}
