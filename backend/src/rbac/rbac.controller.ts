import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from './rbac.constants';
import { RbacService } from './rbac.service';

@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  async listRoles() {
    return {
      roles: await this.rbacService.listRoles(),
    };
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.RBAC_READ)
  async listPermissions() {
    return {
      permissions: await this.rbacService.listPermissions(),
    };
  }
}
