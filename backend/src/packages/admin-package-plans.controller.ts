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
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { SuperAdminOnlyGuard } from '../security-config/super-admin-only.guard';
import { ClientPackageProfileService } from './client-package-profile.service';
import { ApplyClientPackageProfileDto } from './dto/apply-client-package-profile.dto';
import {
  CreatePackagePlanDraftDto,
  CreatePackagePlanItemDto,
  PublishPackagePlanDto,
  UpdatePackagePlanDto,
  UpdatePackagePlanItemDto,
} from './dto/package-plan.dto';
import { PackagesService } from './packages.service';

@Controller('admin/package-plans')
export class AdminPackagePlansController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly clientPackageProfileService: ClientPackageProfileService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PACKAGES_READ)
  listPlanVersions() {
    return this.packagesService.listPlanVersions();
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PACKAGES_DRAFT_MANAGE)
  createDraft(
    @Body() dto: CreatePackagePlanDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.packagesService.createDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Get(':planVersionId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PACKAGES_READ)
  getPlanVersion(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
  ) {
    return this.packagesService.getPlanVersion(planVersionId);
  }

  @Patch(':planVersionId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PACKAGES_DRAFT_MANAGE)
  updatePlanVersion(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Body() dto: UpdatePackagePlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.packagesService.updatePlanVersion(
      planVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':planVersionId/client-profile')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  applyClientPackageProfile(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Body() dto: ApplyClientPackageProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.clientPackageProfileService.apply(
      planVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':planVersionId/items')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PACKAGES_DRAFT_MANAGE)
  createPlanItem(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Body() dto: CreatePackagePlanItemDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.packagesService.createPlanItem(
      planVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Patch(':planVersionId/items/:itemId')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.PACKAGES_DRAFT_MANAGE)
  updatePlanItem(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdatePackagePlanItemDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.packagesService.updatePlanItem(
      planVersionId,
      itemId,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post(':planVersionId/publish')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(SuperAdminOnlyGuard)
  publishPlanVersion(
    @Param('planVersionId', new ParseUUIDPipe()) planVersionId: string,
    @Body() dto: PublishPackagePlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.packagesService.publishPlanVersion(
      planVersionId,
      dto,
      actor,
      getRequestContext(request),
    );
  }
}
