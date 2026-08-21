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
  Put,
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
  AdminCreateUserDto,
  ListUsersQueryDto,
  ReplaceUserRolesDto,
  UpdateUserStatusDto,
} from './dto';
import { UsersService } from './users.service';

@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  create(
    @Body() dto: AdminCreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.create(dto, actor, getRequestContext(request));
  }

  @Post(':userId/impersonation')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.USERS_IMPERSONATE)
  startImpersonation(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.startImpersonation(
      userId,
      actor,
      getRequestContext(request),
    );
  }

  @Delete('impersonation')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  stopImpersonation(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.stopImpersonation(
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':userId/status')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.USERS_STATUS_MANAGE)
  updateStatus(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.updateStatus(
      userId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Put(':userId/roles')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.USERS_ROLES_MANAGE)
  replaceRoles(
    @Param('userId') userId: string,
    @Body() dto: ReplaceUserRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.replaceRoles(
      userId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
