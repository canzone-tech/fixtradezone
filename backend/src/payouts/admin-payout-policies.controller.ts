import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  PayoutPageQueryDto,
  PublishPayoutPolicyDto,
  UpdatePayoutPolicyDraftDto,
} from './dto/payout.dto';
import { PayoutPolicyService } from './payout-policy.service';

@Controller('admin/payout-policies')
export class AdminPayoutPoliciesController {
  constructor(private readonly payoutPolicyService: PayoutPolicyService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_READ)
  list(@Query() query: PayoutPageQueryDto) {
    return this.payoutPolicyService.listPolicies(query);
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_POLICY_MANAGE)
  createDraft(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutPolicyService.createDraft(
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':policyVersionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_POLICY_MANAGE)
  updateDraft(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: UpdatePayoutPolicyDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutPolicyService.updateDraft(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':policyVersionId/publish')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PAYOUTS_POLICY_MANAGE)
  publish(
    @Param('policyVersionId', new ParseUUIDPipe()) policyVersionId: string,
    @Body() dto: PublishPayoutPolicyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payoutPolicyService.publish(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
