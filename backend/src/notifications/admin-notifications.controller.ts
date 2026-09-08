import {
  Body,
  Controller,
  Get,
  Header,
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
  AdminNotificationQueryDto,
  CreateAdminNotificationDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_READ)
  list(@Query() query: AdminNotificationQueryDto) {
    return this.notificationsService.listAdmin(query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  create(
    @Body() dto: CreateAdminNotificationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.notificationsService.createAdminNotification(
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
