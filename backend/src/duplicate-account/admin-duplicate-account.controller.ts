import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import { CreateDuplicateAccountAllowlistDto } from './dto/create-duplicate-account-allowlist.dto';
import { UpdateDuplicateAccountConfigDto } from './dto/update-duplicate-account-config.dto';
import { DuplicateAccountService } from './duplicate-account.service';

@Controller('admin/settings/duplicate-account')
@UseGuards(SuperAdminOnlyGuard)
export class AdminDuplicateAccountController {
  constructor(private readonly service: DuplicateAccountService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getSnapshot() {
    return this.service.getAdminSnapshot();
  }

  @Patch()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  updateConfig(
    @Body() dto: UpdateDuplicateAccountConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updateConfig(dto, actor, getRequestContext(request));
  }

  @Post('allowlist')
  @Header('Cache-Control', 'no-store')
  addAllowlist(
    @Body() dto: CreateDuplicateAccountAllowlistDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.addAllowlist(dto, actor, getRequestContext(request));
  }

  @Delete('allowlist/:id')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  removeAllowlist(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.removeAllowlist(id, actor, getRequestContext(request));
  }
}
