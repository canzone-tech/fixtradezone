import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationService } from '../communication/communication.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { RequestContext } from './auth.types';

interface VerificationUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface StoredVerificationToken {
  userId: string;
  email: string;
  usedAt?: string;
}

const VERIFY_KEY_PREFIX = 'ftz:auth:email-verification';
const GENERIC_RESEND_MESSAGE =
  'If the account is eligible, a verification email has been sent.';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly communicationService: CommunicationService,
  ) {}

  async sendInitial(
    user: VerificationUser,
    context: RequestContext = {},
  ): Promise<{ sent: boolean }> {
    if (!user.email) {
      return { sent: false };
    }

    try {
      await this.issueAndSend(user, context, 'REGISTRATION');
      return { sent: true };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Initial verification delivery failed for user ${user.id}: ${reason}`,
      );

      await this.writeAuditSafe({
        actorUserId: user.id,
        action: 'UPDATE',
        entityType: 'EmailVerification',
        entityId: user.id,
        description: 'Initial email verification delivery failed.',
        metadata: {
          event: 'EMAIL_VERIFICATION_DELIVERY_FAILED',
          reason,
        },
        context,
      });

      return { sent: false };
    }
  }

  async resend(
    email: string,
    context: RequestContext = {},
  ): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const users = await this.prisma.user.findMany({
      where: {
        email: normalizedEmail,
      },
      take: 2,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerifiedAt: true,
        status: true,
      },
    });

    if (users.length !== 1) {
      return { message: GENERIC_RESEND_MESSAGE };
    }

    const user = users[0];

    if (
      !user.email ||
      user.emailVerifiedAt ||
      user.status === 'BLOCKED' ||
      user.status === 'SUSPENDED'
    ) {
      return { message: GENERIC_RESEND_MESSAGE };
    }

    const redis = this.redisService.getClient();
    const cooldownResult = await redis.set(
      this.cooldownKey(user.id),
      '1',
      'EX',
      this.getResendCooldownSeconds(),
      'NX',
    );

    if (cooldownResult !== 'OK') {
      return { message: GENERIC_RESEND_MESSAGE };
    }

    try {
      await this.issueAndSend(user, context, 'RESEND');
    } catch (error) {
      await redis.del(this.cooldownKey(user.id));
      throw error;
    }

    return { message: GENERIC_RESEND_MESSAGE };
  }

  async verify(
    token: string,
    context: RequestContext = {},
  ): Promise<{
    message: string;
    status: string;
    emailVerifiedAt: Date;
  }> {
    const tokenHash = this.hashToken(token);
    const redis = this.redisService.getClient();
    const tokenKey = this.tokenKey(tokenHash);
    const storedValue = await redis.get(tokenKey);

    if (!storedValue) {
      throw new BadRequestException(
        'Email verification link is invalid or expired.',
      );
    }

    const stored = this.parseStoredToken(storedValue);

    if (stored.usedAt) {
      return this.readAlreadyVerified(stored);
    }

    const currentTokenHash = await redis.get(this.userKey(stored.userId));

    if (currentTokenHash !== tokenHash) {
      throw new BadRequestException(
        'Email verification link is invalid or expired.',
      );
    }

    const verifiedAt = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: {
          id: stored.userId,
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          status: true,
        },
      });

      if (!user || user.email?.toLowerCase() !== stored.email.toLowerCase()) {
        throw new BadRequestException(
          'Email verification link is invalid or expired.',
        );
      }

      if (user.emailVerifiedAt) {
        return {
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
          alreadyVerified: true,
        };
      }

      const nextStatus = user.status === 'PENDING' ? 'ACTIVE' : user.status;

      const updated = await transaction.user.update({
        where: {
          id: user.id,
        },
        data: {
          emailVerifiedAt: verifiedAt,
          status: nextStatus,
        },
        select: {
          status: true,
          emailVerifiedAt: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'APPROVE',
          entityType: 'EmailVerification',
          entityId: user.id,
          description: 'User email address verified successfully.',
          metadata: {
            event: 'EMAIL_VERIFIED',
            accountActivated: user.status === 'PENDING',
            previousStatus: user.status,
            newStatus: updated.status,
          },
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });

      return {
        status: updated.status,
        emailVerifiedAt: updated.emailVerifiedAt ?? verifiedAt,
        alreadyVerified: false,
      };
    });

    await redis
      .multi()
      .set(
        tokenKey,
        JSON.stringify({
          ...stored,
          usedAt: result.emailVerifiedAt.toISOString(),
        } satisfies StoredVerificationToken),
        'EX',
        this.getVerificationTtlSeconds(),
      )
      .del(this.userKey(stored.userId), this.cooldownKey(stored.userId))
      .exec();

    return {
      message: result.alreadyVerified
        ? 'Email address is already verified.'
        : result.status === 'ACTIVE'
          ? 'Email verified successfully. Your account is now ready to sign in.'
          : `Email verified successfully. Account status remains ${result.status}.`,
      status: result.status,
      emailVerifiedAt: result.emailVerifiedAt,
    };
  }

  private async readAlreadyVerified(stored: StoredVerificationToken): Promise<{
    message: string;
    status: string;
    emailVerifiedAt: Date;
  }> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: stored.userId,
      },
      select: {
        email: true,
        emailVerifiedAt: true,
        status: true,
      },
    });

    if (
      !user ||
      !user.emailVerifiedAt ||
      user.email?.toLowerCase() !== stored.email.toLowerCase()
    ) {
      throw new BadRequestException(
        'Email verification link is invalid or expired.',
      );
    }

    return {
      message: 'Email address is already verified.',
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }

  private parseStoredToken(value: string): StoredVerificationToken {
    try {
      const parsed = JSON.parse(value) as Partial<StoredVerificationToken>;

      if (
        typeof parsed.userId !== 'string' ||
        typeof parsed.email !== 'string'
      ) {
        throw new Error('Invalid token payload');
      }

      return {
        userId: parsed.userId,
        email: parsed.email,
        ...(typeof parsed.usedAt === 'string' ? { usedAt: parsed.usedAt } : {}),
      };
    } catch {
      throw new BadRequestException(
        'Email verification link is invalid or expired.',
      );
    }
  }

  private async issueAndSend(
    user: VerificationUser,
    context: RequestContext,
    reason: 'REGISTRATION' | 'RESEND',
  ): Promise<void> {
    if (!user.email) {
      throw new Error('Email address is required for verification.');
    }

    const redis = this.redisService.getClient();
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const ttlSeconds = this.getVerificationTtlSeconds();
    const currentKey = this.userKey(user.id);
    const oldHash = await redis.get(currentKey);
    const multi = redis.multi();

    if (oldHash) {
      multi.del(this.tokenKey(oldHash));
    }

    multi.set(currentKey, tokenHash, 'EX', ttlSeconds);
    multi.set(
      this.tokenKey(tokenHash),
      JSON.stringify({
        userId: user.id,
        email: user.email.toLowerCase(),
      } satisfies StoredVerificationToken),
      'EX',
      ttlSeconds,
    );

    await multi.exec();

    const verificationUrl = `${this.getPublicAppUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      'FixTradeZone user';
    const ttlMinutes = Math.ceil(ttlSeconds / 60);

    const delivery = await this.communicationService.sendEmail({
      to: user.email,
      subject: 'Verify your FixTradeZone account',
      text: [
        `Hi ${displayName},`,
        '',
        'Verify your email address to activate your FixTradeZone account:',
        verificationUrl,
        '',
        `This verification link expires in ${ttlMinutes} minutes.`,
        'If you did not create this account, you can ignore this message.',
      ].join('\n'),
      html: `<p>Hi ${this.escapeHtml(displayName)},</p><p>Verify your email address to activate your FixTradeZone account.</p><p><a href="${this.escapeHtml(verificationUrl)}">Verify Email</a></p><p>This verification link expires in ${ttlMinutes} minutes.</p>`,
    });

    await this.writeAuditSafe({
      actorUserId: user.id,
      action: 'CREATE',
      entityType: 'EmailVerification',
      entityId: user.id,
      description: 'Email verification message issued.',
      metadata: {
        event: 'EMAIL_VERIFICATION_ISSUED',
        reason,
        transport: delivery.transport,
        ttlSeconds,
      },
      context,
    });
  }

  private async writeAuditSafe(input: {
    actorUserId: string;
    action: 'CREATE' | 'UPDATE';
    entityType: string;
    entityId: string;
    description: string;
    metadata: Record<string, unknown>;
    context: RequestContext;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          description: input.description,
          metadata: input.metadata,
          ipAddress: input.context.ipAddress,
          userAgent: input.context.userAgent,
        },
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to record email verification audit: ${reason}`);
    }
  }

  private getVerificationTtlSeconds(): number {
    const minutes =
      this.configService.get<number>('EMAIL_VERIFICATION_TTL_MINUTES') ?? 30;
    return Math.max(5, minutes) * 60;
  }

  private getResendCooldownSeconds(): number {
    return Math.max(
      10,
      this.configService.get<number>(
        'EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS',
      ) ?? 60,
    );
  }

  private getPublicAppUrl(): string {
    const configured =
      this.configService.get<string>('PUBLIC_APP_URL') ??
      'https://localhost:3001';
    return configured.replace(/\/+$/, '');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private userKey(userId: string): string {
    return `${VERIFY_KEY_PREFIX}:user:${userId}`;
  }

  private tokenKey(tokenHash: string): string {
    return `${VERIFY_KEY_PREFIX}:token:${tokenHash}`;
  }

  private cooldownKey(userId: string): string {
    return `${VERIFY_KEY_PREFIX}:cooldown:${userId}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
