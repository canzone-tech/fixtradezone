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
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import { ExecuteLegacyUsernameMigrationDto } from './dto/execute-legacy-username-migration.dto';
import { LegacyUsernameMigrationService } from './legacy-username-migration.service';

@Controller('admin/users/username-migration')
@UseGuards(SuperAdminOnlyGuard)
export class LegacyUsernameMigrationController {
  constructor(
    private readonly migrationService: LegacyUsernameMigrationService,
  ) {}

  @Get('preview')
  @Header('Cache-Control', 'no-store')
  preview() {
    return this.migrationService.preview();
  }

  @Post('execute')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  execute(
    @Body() dto: ExecuteLegacyUsernameMigrationDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.migrationService.execute(
      dto.confirmation,
      actor,
      getRequestContext(request),
    );
  }
}
