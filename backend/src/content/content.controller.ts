import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { getRequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { ContentService } from './content.service';
import {
  CreateEmailTemplateDraftDto,
  CreateLandingDraftDto,
} from './dto/content.dto';

@Controller('public/content')
export class PublicContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('landing')
  @Public()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  getLanding() {
    return this.contentService.getPublicLanding();
  }
}

@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly contentService: ContentService) {}

  @Get('landing')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  getLandingWorkspace() {
    return this.contentService.getAdminLanding();
  }

  @Post('landing/drafts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_MANAGE)
  createLandingDraft(
    @Body() dto: CreateLandingDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.createLandingDraft(
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post('landing/:revisionId/publish')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
  publishLanding(
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.publishLanding(
      revisionId,
      actor,
      getRequestContext(request),
    );
  }

  @Get('email-templates')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  getEmailTemplates() {
    return this.contentService.getEmailTemplateWorkspaces();
  }

  @Get('email-templates/:templateKey')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_READ)
  getEmailTemplate(@Param('templateKey') templateKey: string) {
    return this.contentService.getEmailTemplateWorkspace(templateKey);
  }

  @Post('email-templates/:templateKey/drafts')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_MANAGE)
  createEmailTemplateDraft(
    @Param('templateKey') templateKey: string,
    @Body() dto: CreateEmailTemplateDraftDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.createEmailTemplateDraft(
      templateKey,
      dto,
      actor,
      getRequestContext(request),
    );
  }

  @Post('email-templates/:templateKey/:revisionId/publish')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(PERMISSIONS.CONTENT_PUBLISH)
  publishEmailTemplate(
    @Param('templateKey') templateKey: string,
    @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.contentService.publishEmailTemplate(
      templateKey,
      revisionId,
      actor,
      getRequestContext(request),
    );
  }
}
