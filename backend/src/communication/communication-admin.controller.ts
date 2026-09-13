import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { PrismaService } from '../database/prisma.service';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import { CommunicationService } from './communication.service';
import { TestEmailDto } from './dto/test-email.dto';
import { TestManagedEmailTemplateDto } from './dto/test-managed-email-template.dto';
import { renderEmailDeliveryTestTemplate } from './email-template.renderer';

@Controller('admin/communication/email')
@UseGuards(SuperAdminOnlyGuard)
export class CommunicationAdminController {
  constructor(
    private readonly communicationService: CommunicationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return this.communicationService.getEmailConfigurationStatus();
  }

  @Post('test')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async test(
    @Body() dto: TestEmailDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const delivery = await this.communicationService.sendEmail(
      renderEmailDeliveryTestTemplate({
        to: dto.to,
        actorUsername: actor.username,
        triggeredAt: new Date(),
      }),
    );

    const context = getRequestContext(request);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'CREATE',
        entityType: 'CommunicationEmailTest',
        entityId: actor.id,
        description:
          'Super administrator sent an email transport test message.',
        metadata: {
          event: 'EMAIL_TRANSPORT_TEST_SENT',
          transport: delivery.transport,
          recipient: dto.to,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      message: 'Test email accepted by the configured transport.',
      transport: delivery.transport,
      accepted: delivery.accepted,
    };
  }

  @Post('templates/:templateKey/test')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async testManagedTemplate(
    @Param('templateKey') templateKey: string,
    @Body() dto: TestManagedEmailTemplateDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const delivery =
      await this.communicationService.sendControlledTemplateTest({
        contentKey: templateKey,
        content: dto.content,
        to: dto.to,
        actorUsername: actor.username,
      });

    const context = getRequestContext(request);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'CREATE',
        entityType: 'CommunicationEmailTemplateTest',
        entityId: actor.id,
        description:
          'Super administrator sent a controlled managed email-template test.',
        metadata: {
          event: 'EMAIL_TEMPLATE_TEST_SENT',
          templateKey: templateKey.trim().toUpperCase(),
          transport: delivery.transport,
          recipient: dto.to,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      message: 'Template test accepted by the configured transport.',
      transport: delivery.transport,
      accepted: delivery.accepted,
    };
  }
}
