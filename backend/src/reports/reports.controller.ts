import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { ReportWindowQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REPORTS_READ)
  getOverview(@Query() query: ReportWindowQueryDto) {
    return this.reportsService.getOverview(query);
  }
}
