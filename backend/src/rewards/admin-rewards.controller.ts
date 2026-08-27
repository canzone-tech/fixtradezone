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
  AdminRewardEventQueryDto,
  AdminRewardStateQueryDto,
  CreateRewardPolicyDraftDto,
  PublishRewardPolicyDto,
  RewardPageQueryDto,
  UpdateRewardPolicyDto,
} from './dto/reward.dto';
import { RewardsService } from './rewards.service';

@Controller('admin/reward-policies')
export class AdminRewardPoliciesController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_READ)
  listPolicies() {
    return this.rewardsService.listPolicies();
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  createDraft(
    @Body() dto: CreateRewardPolicyDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rewardsService.createPolicyDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get(':policyVersionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_READ)
  getPolicy(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
  ) {
    return this.rewardsService.getPolicy(policyVersionId);
  }

  @Patch(':policyVersionId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  updateDraft(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: UpdateRewardPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rewardsService.updatePolicyDraft(
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
    @Body() dto: PublishRewardPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rewardsService.publishPolicy(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}

@Controller('admin/rewards')
export class AdminRewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_READ)
  listEvents(@Query() query: AdminRewardEventQueryDto) {
    return this.rewardsService.listEvents(query);
  }

  @Get('states')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_READ)
  listStates(@Query() query: AdminRewardStateQueryDto) {
    return this.rewardsService.listStates(query);
  }

  @Get('reconciliation')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_RECONCILE)
  listReconciliation(@Query() query: RewardPageQueryDto) {
    return this.rewardsService.listReconciliation(query);
  }

  @Get('worker-health')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_READ)
  getWorkerHealth() {
    return this.rewardsService.getWorkerHealth();
  }

  @Post('process-due')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_RECONCILE)
  processDue(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rewardsService.processDueBatch(
      actor,
      getRequestContext(request),
      false,
    );
  }
}

@Controller('admin/subscriptions')
export class AdminSubscriptionRewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Post(':subscriptionId/process-rewards')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.REWARDS_RECONCILE)
  processSubscription(
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rewardsService.reconcileSubscription(
      subscriptionId,
      actor,
      getRequestContext(request),
    );
  }
}
