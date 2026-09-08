import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PERMISSIONS } from '../rbac/rbac.constants';
import {
  AdminGenealogyPageQueryDto,
  AdminGenealogySearchQueryDto,
} from './dto/genealogy-query.dto';
import { GenealogyService } from './genealogy.service';

@Controller('admin/referrals/genealogy')
export class AdminGenealogyController {
  constructor(private readonly genealogyService: GenealogyService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REFERRALS_READ)
  getTree(@Query() query: AdminGenealogyPageQueryDto) {
    return this.genealogyService.getAdmin(query);
  }

  @Get('search')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REFERRALS_READ)
  search(@Query() query: AdminGenealogySearchQueryDto) {
    return this.genealogyService.searchAdmin(query);
  }
}
