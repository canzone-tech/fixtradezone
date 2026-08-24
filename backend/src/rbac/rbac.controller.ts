import { Body, Controller, Get, Header, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { ReplaceRolePermissionsDto } from './dto/replace-role-permissions.dto';
import { PERMISSIONS } from './rbac.constants';
import { RbacService } from './rbac.service';

@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  async listRoles() {
    return {
      roles: await this.rbacService.listRoles(),
    };
  }

  @Get('permissions')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  async listPermissions() {
    return {
      permissions: await this.rbacService.listPermissions(),
    };
  }

  @Put('roles/:roleName/permissions')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.RBAC_MANAGE)
  replaceRolePermissions(
    @Param('roleName') roleName: string,
    @Body() dto: ReplaceRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rbacService.replaceRolePermissions(
      roleName,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
