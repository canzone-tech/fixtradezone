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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { getRequestContext } from '../auth/request-context';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import {
  CreateInternalTradingPolicyDraftDto,
  PublishInternalTradingPolicyDto,
  UpdateInternalTradingPolicyDto,
} from './dto/internal-trading.dto';
import { InternalTradingService } from './internal-trading.service';

@Controller('admin/internal-trading/policies')
@UseGuards(SuperAdminOnlyGuard)
export class AdminInternalTradingPoliciesController {
  constructor(private readonly service: InternalTradingService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  listPolicies() {
    return this.service.listPolicies();
  }

  @Get(':policyVersionId')
  @Header('Cache-Control', 'no-store')
  getPolicy(
    @Param('policyVersionId', new ParseUUIDPipe())
    policyVersionId: string,
  ) {
    return this.service.getPolicy(policyVersionId);
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  createDraft(
    @Body()
    dto: CreateInternalTradingPolicyDraftDto,
    @CurrentUser()
    actor: AuthenticatedUser,
    @Req()
    request: Request,
  ) {
    return this.service.createPolicyDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':policyVersionId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  updateDraft(
    @Param('policyVersionId', new ParseUUIDPipe())
    policyVersionId: string,
    @Body()
    dto: UpdateInternalTradingPolicyDto,
    @CurrentUser()
    actor: AuthenticatedUser,
    @Req()
    request: Request,
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
  publish(
    @Param('policyVersionId', new ParseUUIDPipe())
    policyVersionId: string,
    @Body()
    dto: PublishInternalTradingPolicyDto,
    @CurrentUser()
    actor: AuthenticatedUser,
    @Req()
    request: Request,
  ) {
    return this.service.publishPolicy(
      policyVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
