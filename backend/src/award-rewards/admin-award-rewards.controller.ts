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
import { AwardRewardsService } from './award-rewards.service';
import {
  AdminAwardRewardEventQueryDto,
  AdminAwardRewardTrackQueryDto,
  CreateAwardRewardPolicyDraftDto,
  PublishAwardRewardPolicyDto,
  ReconcileAwardRewardDto,
  UpdateAwardRewardPolicyDto,
} from './dto/award-reward.dto';

@Controller('admin/award-reward-policies')
export class AdminAwardRewardPoliciesController {
  constructor(private readonly awardRewardsService: AwardRewardsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AWARD_REWARDS_READ)
  listPolicies() {
    return this.awardRewardsService.listPolicies();
  }

  @Get('packages')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AWARD_REWARDS_READ)
  listPackages() {
    return this.awardRewardsService.listPackageOptions();
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  createDraft(
    @Body() dto: CreateAwardRewardPolicyDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.awardRewardsService.createPolicyDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get(':policyVersionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AWARD_REWARDS_READ)
  getPolicy(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
  ) {
    return this.awardRewardsService.getPolicy(policyVersionId);
  }

  @Patch(':policyVersionId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  updatePolicy(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: UpdateAwardRewardPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.awardRewardsService.updatePolicyDraft(
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
  publishPolicy(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: PublishAwardRewardPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.awardRewardsService.publishPolicy(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}

@Controller('admin/award-rewards')
export class AdminAwardRewardsController {
  constructor(private readonly awardRewardsService: AwardRewardsService) {}

  @Get('tracks')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AWARD_REWARDS_READ)
  listTracks(@Query() query: AdminAwardRewardTrackQueryDto) {
    return this.awardRewardsService.listTracks(query);
  }

  @Get('events')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AWARD_REWARDS_READ)
  listEvents(@Query() query: AdminAwardRewardEventQueryDto) {
    return this.awardRewardsService.listEvents(query);
  }

  @Post('reconcile')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.AWARD_REWARDS_RECONCILE)
  reconcile(
    @Body() dto: ReconcileAwardRewardDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<unknown> {
    return this.awardRewardsService.reconcile(
      dto.userId,
      actor,
      getRequestContext(request),
      false,
    );
  }
}
