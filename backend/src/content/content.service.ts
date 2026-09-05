import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  CONTENT_KEYS,
  DEFAULT_EMAIL_CONTENT,
  DEFAULT_LANDING_CONTENT,
  EMAIL_ALLOWED_VARIABLES,
  EMAIL_TEMPLATE_KEY,
  type EmailContentKey,
  type EmailTemplateContent,
  isEmailContentKey,
  LANDING_TEMPLATE_KEY,
  type LandingContent,
} from './content.defaults';
import type {
  CreateEmailTemplateDraftDto,
  CreateLandingDraftDto,
} from './dto/content.dto';

type RevisionStatus = 'DRAFT' | 'PUBLISHED';

interface ContentRevisionRow {
  id: string;
  contentKey: string;
  version: number | bigint;
  status: RevisionStatus;
  templateKey: string;
  payload: unknown;
  createdByUserId: string | null;
  publishedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

interface MaxVersionRow {
  maxVersion: number | bigint | string | null;
}

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicLanding() {
    const revision = await this.findLatestPublished(CONTENT_KEYS.LANDING_PAGE);
    const content = revision
      ? this.asLandingContent(revision.payload)
      : DEFAULT_LANDING_CONTENT;

    return {
      templateKey: revision?.templateKey ?? LANDING_TEMPLATE_KEY,
      revision: revision ? this.serializeRevision(revision) : null,
      content,
      source: revision ? 'PUBLISHED_REVISION' : 'DEFAULT',
    };
  }

  async getAdminLanding() {
    return this.getWorkspace(
      CONTENT_KEYS.LANDING_PAGE,
      LANDING_TEMPLATE_KEY,
      DEFAULT_LANDING_CONTENT,
    );
  }

  async getEmailTemplateWorkspaces() {
    return Promise.all(
      (Object.keys(DEFAULT_EMAIL_CONTENT) as EmailContentKey[]).map((contentKey) =>
        this.getEmailTemplateWorkspace(contentKey),
      ),
    );
  }

  async getEmailTemplateWorkspace(rawContentKey: string) {
    const contentKey = this.assertEmailContentKey(rawContentKey);
    const workspace = await this.getWorkspace(
      contentKey,
      EMAIL_TEMPLATE_KEY,
      DEFAULT_EMAIL_CONTENT[contentKey],
    );

    return {
      ...workspace,
      allowedVariables: EMAIL_ALLOWED_VARIABLES[contentKey],
    };
  }

  async getPublishedEmailTemplate(
    contentKey: EmailContentKey,
  ): Promise<EmailTemplateContent> {
    const revision = await this.findLatestPublished(contentKey);
    if (!revision) {
      return DEFAULT_EMAIL_CONTENT[contentKey];
    }
    return this.asEmailTemplateContent(revision.payload, contentKey);
  }

  async createLandingDraft(
    dto: CreateLandingDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSafeHref(dto.primaryCtaHref, 'primaryCtaHref');
    this.assertSafeHref(dto.secondaryCtaHref, 'secondaryCtaHref');

    const revision = await this.createDraftRevision(
      CONTENT_KEYS.LANDING_PAGE,
      LANDING_TEMPLATE_KEY,
      dto,
      actor,
      context,
    );

    return {
      message: 'Landing-page draft revision created.',
      revision: this.serializeRevision(revision),
    };
  }

  async createEmailTemplateDraft(
    rawContentKey: string,
    dto: CreateEmailTemplateDraftDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const contentKey = this.assertEmailContentKey(rawContentKey);
    this.assertAllowedTemplateVariables(contentKey, dto);

    const revision = await this.createDraftRevision(
      contentKey,
      EMAIL_TEMPLATE_KEY,
      dto,
      actor,
      context,
    );

    return {
      message: 'Email-template draft revision created.',
      allowedVariables: EMAIL_ALLOWED_VARIABLES[contentKey],
      revision: this.serializeRevision(revision),
    };
  }

  async publishLanding(
    revisionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.publishRevision(
      CONTENT_KEYS.LANDING_PAGE,
      revisionId,
      actor,
      context,
    );
  }

  async publishEmailTemplate(
    rawContentKey: string,
    revisionId: string,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const contentKey = this.assertEmailContentKey(rawContentKey);
    return this.publishRevision(contentKey, revisionId, actor, context);
  }

  private async getWorkspace(
    contentKey: string,
    templateKey: string,
    defaultContent: LandingContent | EmailTemplateContent,
  ) {
    const revisions = await this.findRevisions(contentKey);
    const published = revisions.find((revision) => revision.status === 'PUBLISHED');

    return {
      contentKey,
      templateKey,
      effective: published?.payload ?? defaultContent,
      effectiveSource: published ? 'PUBLISHED_REVISION' : 'DEFAULT',
      publishedRevision: published ? this.serializeRevision(published) : null,
      revisions: revisions.map((revision) => this.serializeRevision(revision)),
    };
  }

  private async createDraftRevision(
    contentKey: string,
    templateKey: string,
    payload: object,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<ContentRevisionRow> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const rows = await transaction.$queryRaw<MaxVersionRow[]>`
              SELECT MAX(\`version\`) AS \`maxVersion\`
              FROM \`content_revisions\`
              WHERE \`contentKey\` = ${contentKey}
            `;
            const maxVersion = Number(rows[0]?.maxVersion ?? 0);
            const version = maxVersion + 1;
            const id = randomUUID();
            const payloadJson = JSON.stringify(payload);

            await transaction.$executeRaw`
              INSERT INTO \`content_revisions\`
                (\`id\`, \`contentKey\`, \`version\`, \`status\`, \`templateKey\`, \`payload\`, \`createdByUserId\`, \`createdAt\`, \`updatedAt\`)
              VALUES
                (${id}, ${contentKey}, ${version}, 'DRAFT', ${templateKey}, ${payloadJson}, ${actor.id}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
            `;

            await transaction.auditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'CREATE',
                entityType: 'ContentRevision',
                entityId: id,
                description: 'Administrator created a versioned content draft.',
                metadata: {
                  source: 'ADMIN_API',
                  contentKey,
                  templateKey,
                  version,
                },
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
              },
            });

            const revision = await this.findRevisionByIdWithClient(
              transaction,
              contentKey,
              id,
            );
            if (!revision) {
              throw new Error('Content revision insert did not read back.');
            }
            return revision;
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private async publishRevision(
    contentKey: string,
    revisionId: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const revision = await this.findRevisionByIdWithClient(
          transaction,
          contentKey,
          revisionId,
        );
        if (!revision) {
          throw new NotFoundException('Content revision not found.');
        }
        if (revision.status === 'PUBLISHED') {
          return {
            message: 'Content revision is already published.',
            revision: this.serializeRevision(revision),
          };
        }

        const changed = await transaction.$executeRaw`
          UPDATE \`content_revisions\`
          SET
            \`status\` = 'PUBLISHED',
            \`publishedByUserId\` = ${actor.id},
            \`publishedAt\` = CURRENT_TIMESTAMP(3),
            \`updatedAt\` = CURRENT_TIMESTAMP(3)
          WHERE \`id\` = ${revisionId}
            AND \`contentKey\` = ${contentKey}
            AND \`status\` = 'DRAFT'
        `;

        if (changed !== 1) {
          throw new BadRequestException(
            'Only an existing draft revision can be published.',
          );
        }

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'APPROVE',
            entityType: 'ContentRevision',
            entityId: revisionId,
            description: 'Administrator published a content revision.',
            metadata: {
              source: 'ADMIN_API',
              contentKey,
              version: Number(revision.version),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        const published = await this.findRevisionByIdWithClient(
          transaction,
          contentKey,
          revisionId,
        );
        if (!published) {
          throw new Error('Published content revision did not read back.');
        }

        return {
          message: 'Content revision published.',
          revision: this.serializeRevision(published),
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async findLatestPublished(
    contentKey: string,
  ): Promise<ContentRevisionRow | null> {
    const rows = await this.prisma.$queryRaw<ContentRevisionRow[]>`
      SELECT
        \`id\`, \`contentKey\`, \`version\`, \`status\`, \`templateKey\`, \`payload\`,
        \`createdByUserId\`, \`publishedByUserId\`, \`createdAt\`, \`updatedAt\`, \`publishedAt\`
      FROM \`content_revisions\`
      WHERE \`contentKey\` = ${contentKey} AND \`status\` = 'PUBLISHED'
      ORDER BY \`version\` DESC
      LIMIT 1
    `;
    return rows[0] ? this.normalizeRevision(rows[0]) : null;
  }

  private async findRevisions(contentKey: string): Promise<ContentRevisionRow[]> {
    const rows = await this.prisma.$queryRaw<ContentRevisionRow[]>`
      SELECT
        \`id\`, \`contentKey\`, \`version\`, \`status\`, \`templateKey\`, \`payload\`,
        \`createdByUserId\`, \`publishedByUserId\`, \`createdAt\`, \`updatedAt\`, \`publishedAt\`
      FROM \`content_revisions\`
      WHERE \`contentKey\` = ${contentKey}
      ORDER BY \`version\` DESC
      LIMIT 100
    `;
    return rows.map((row) => this.normalizeRevision(row));
  }

  private async findRevisionByIdWithClient(
    client: Pick<PrismaService, '$queryRaw'>,
    contentKey: string,
    revisionId: string,
  ): Promise<ContentRevisionRow | null> {
    const rows = await client.$queryRaw<ContentRevisionRow[]>`
      SELECT
        \`id\`, \`contentKey\`, \`version\`, \`status\`, \`templateKey\`, \`payload\`,
        \`createdByUserId\`, \`publishedByUserId\`, \`createdAt\`, \`updatedAt\`, \`publishedAt\`
      FROM \`content_revisions\`
      WHERE \`id\` = ${revisionId} AND \`contentKey\` = ${contentKey}
      LIMIT 1
    `;
    return rows[0] ? this.normalizeRevision(rows[0]) : null;
  }

  private normalizeRevision(row: ContentRevisionRow): ContentRevisionRow {
    let payload = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as unknown;
      } catch {
        throw new BadRequestException('Stored content revision payload is invalid.');
      }
    }

    return {
      ...row,
      version: Number(row.version),
      payload,
    };
  }

  private serializeRevision(row: ContentRevisionRow) {
    return {
      ...row,
      version: Number(row.version),
    };
  }

  private assertEmailContentKey(rawContentKey: string): EmailContentKey {
    const contentKey = rawContentKey.trim().toUpperCase();
    if (!isEmailContentKey(contentKey)) {
      throw new NotFoundException('Email template not found.');
    }
    return contentKey;
  }

  private assertSafeHref(value: string, fieldName: string) {
    const href = value.trim();
    if (href.startsWith('/') && !href.startsWith('//')) {
      return;
    }
    try {
      const parsed = new URL(href);
      if (parsed.protocol === 'https:') {
        return;
      }
    } catch {
      // handled below
    }
    throw new BadRequestException(
      `${fieldName} must be a local absolute path or an HTTPS URL.`,
    );
  }

  private assertAllowedTemplateVariables(
    contentKey: EmailContentKey,
    content: EmailTemplateContent,
  ) {
    const allowed = new Set(EMAIL_ALLOWED_VARIABLES[contentKey]);
    const values = Object.values(content);
    const variablePattern = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;

    for (const value of values) {
      for (const match of value.matchAll(variablePattern)) {
        const variable = match[1];
        if (!allowed.has(variable)) {
          throw new BadRequestException(
            `Template variable {{${variable}}} is not allowed for ${contentKey}.`,
          );
        }
      }
    }
  }

  private asLandingContent(payload: unknown): LandingContent {
    if (!this.isRecord(payload)) {
      return DEFAULT_LANDING_CONTENT;
    }
    const requiredStrings = [
      'brandName',
      'badge',
      'heroTitle',
      'heroAccent',
      'heroDescription',
      'primaryCtaLabel',
      'primaryCtaHref',
      'secondaryCtaLabel',
      'secondaryCtaHref',
      'trustTitle',
      'trustDescription',
      'disclosure',
      'footerText',
      'seoTitle',
      'seoDescription',
    ];
    if (requiredStrings.some((key) => typeof payload[key] !== 'string')) {
      return DEFAULT_LANDING_CONTENT;
    }
    if (!Array.isArray(payload.features)) {
      return DEFAULT_LANDING_CONTENT;
    }
    return payload as unknown as LandingContent;
  }

  private asEmailTemplateContent(
    payload: unknown,
    contentKey: EmailContentKey,
  ): EmailTemplateContent {
    if (!this.isRecord(payload)) {
      return DEFAULT_EMAIL_CONTENT[contentKey];
    }
    const keys: Array<keyof EmailTemplateContent> = [
      'subject',
      'preheader',
      'headline',
      'body',
      'ctaLabel',
      'footer',
    ];
    if (keys.some((key) => typeof payload[key] !== 'string')) {
      return DEFAULT_EMAIL_CONTENT[contentKey];
    }
    return payload as unknown as EmailTemplateContent;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
