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
  AdminSimulatedActivityEventQueryDto,
  CreateSimulatedActivityPolicyDraftDto,
  PublishSimulatedActivityPolicyDto,
  UpdateSimulatedActivityPolicyDto,
} from './dto/simulated-activity.dto';
import { SimulatedActivityService } from './simulated-activity.service';
import { SimulatedActivityWorkerService } from './simulated-activity.worker.service';

@Controller('admin/simulated-activity/policies')
export class AdminSimulatedActivityPoliciesController {
  constructor(private readonly service: SimulatedActivityService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_READ)
  listPolicies() {
    return this.service.listPolicies();
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  createDraft(
    @Body() dto: CreateSimulatedActivityPolicyDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.createPolicyDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get(':policyVersionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_READ)
  getPolicy(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
  ) {
    return this.service.getPolicy(policyVersionId);
  }

  @Patch(':policyVersionId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  updateDraft(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: UpdateSimulatedActivityPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.updatePolicyDraft(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':policyVersionId/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  publish(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: PublishSimulatedActivityPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.publishPolicy(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}

@Controller('admin/simulated-activity')
export class AdminSimulatedActivityController {
  constructor(
    private readonly service: SimulatedActivityService,
    private readonly worker: SimulatedActivityWorkerService,
  ) {}

  @Get('events')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_READ)
  listEvents(@Query() query: AdminSimulatedActivityEventQueryDto) {
    return this.service.listEvents(query);
  }

  @Get('reconciliation')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_RECONCILE)
  getReconciliation() {
    return this.service.getReconciliationSummary();
  }

  @Get('worker-health')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_READ)
  async getWorkerHealth() {
    return {
      ...this.service.getWorkerHealth(),
      ...(await this.worker.getRuntimeStatus()),
    };
  }

  @Post('process-due')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_RECONCILE)
  processDue(@CurrentUser() actor: AuthenticatedUser, @Req() request: Request) {
    return this.service.processDueBatch(
      actor,
      getRequestContext(request),
      false,
    );
  }
}

@Controller('admin/subscriptions')
export class AdminSubscriptionSimulatedActivityController {
  constructor(private readonly service: SimulatedActivityService) {}

  @Post(':subscriptionId/process-simulated-activity')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.SIMULATED_ACTIVITY_RECONCILE)
  processSubscription(
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.service.reconcileSubscription(
      subscriptionId,
      actor,
      getRequestContext(request),
    );
  }
}
