import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import {
  AdminCommissionQueryDto,
  CommissionPageQueryDto,
  CreateCommissionPlanDraftDto,
  PublishCommissionPlanDto,
  UpdateCommissionPlanDto,
} from './dto/commission.dto';
import { CommissionsService } from './commissions.service';

@Controller('admin/commission-plans')
export class AdminCommissionPlansController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_READ)
  listPlans() {
    return this.commissionsService.listPlans();
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_PLAN_MANAGE)
  createDraft(
    @Body() dto: CreateCommissionPlanDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.commissionsService.createDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get(':planVersionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_READ)
  getPlan(@Param('planVersionId', new ParseUUIDPipe()) planVersionId: string) {
    return this.commissionsService.getPlan(planVersionId);
  }

  @Patch(':planVersionId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_PLAN_MANAGE)
  updateDraft(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Body() dto: UpdateCommissionPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.commissionsService.updateDraft(
      planVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':planVersionId/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  publishPlan(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Body() dto: PublishCommissionPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.commissionsService.publishPlan(
      planVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}

@Controller('admin/commissions')
export class AdminCommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_READ)
  listCommissions(@Query() query: AdminCommissionQueryDto) {
    return this.commissionsService.listCommissions(query);
  }

  @Get('reconciliation')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_RECONCILE)
  listReconciliation(@Query() query: CommissionPageQueryDto) {
    return this.commissionsService.listReconciliation(query);
  }
}

@Controller('admin/subscriptions')
export class AdminSubscriptionCommissionController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Post(':subscriptionId/process-commissions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.COMMISSIONS_RECONCILE)
  processCommissions(
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.commissionsService.reconcileSubscription(
      subscriptionId,
      actor,
      getRequestContext(request),
    );
  }
}
