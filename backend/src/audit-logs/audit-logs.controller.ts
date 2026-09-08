import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log.dto';

@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AUDIT_LOGS_READ)
  list(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.list(query);
  }
}
