import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
    const delivery = await this.communicationService.sendEmail({
      to: dto.to,
      subject: 'FixTradeZone email delivery test',
      text: [
        'FixTradeZone email delivery test succeeded.',
        '',
        `Triggered by ${actor.username}.`,
        `Time: ${new Date().toISOString()}`,
      ].join('\n'),
      html: '<p><strong>FixTradeZone email delivery test succeeded.</strong></p><p>This message confirms the configured email transport accepted a test message.</p>',
    });

    const context = getRequestContext(request);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'CREATE',
        entityType: 'CommunicationEmailTest',
        entityId: actor.id,
        description: 'Super administrator sent an email transport test message.',
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
}
