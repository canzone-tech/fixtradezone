import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AdminSupportAttachmentController,
  SupportAttachmentController,
} from './support-attachment.controller';
import { SupportAttachmentService } from './support-attachment.service';
import { AdminSupportController } from './admin-support.controller';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [NotificationsModule],
  controllers: [
    SupportController,
    AdminSupportController,
    SupportAttachmentController,
    AdminSupportAttachmentController,
  ],
  providers: [SupportService, SupportAttachmentService],
  exports: [SupportService, SupportAttachmentService],
})
export class SupportModule {}
