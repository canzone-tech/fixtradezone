import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationService } from '../communication/communication.service';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import type { RequestContext } from './auth.types';
import { PasswordService } from './password.service';

interface ResetUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface StoredResetToken {
  userId: string;
  email: string;
}

const RESET_KEY_PREFIX = 'ftz:auth:password-reset';
const GENERIC_REQUEST_MESSAGE =
  'If the account is eligible, a password reset email has been sent.';
const INVALID_RESET_MESSAGE = 'Password reset link is invalid or expired.';

const CONSUME_RESET_TOKEN_SCRIPT = `
local payload = redis.call('GET', KEYS[1])
if not payload then
  return nil
end
local current = redis.call('GET', KEYS[2])
if current ~= ARGV[1] then
  return nil
end
redis.call('DEL', KEYS[1], KEYS[2])
return payload
`;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly communicationService: CommunicationService,
    private readonly passwordService: PasswordService,
  ) {}

  async request(
    email: string,
    context: RequestContext = {},
  ): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const users = await this.prisma.user.findMany({
      where: { email: normalizedEmail },
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
      return { message: GENERIC_REQUEST_MESSAGE };
    }

    const user = users[0];
    if (!user.email || !user.emailVerifiedAt || user.status !== 'ACTIVE') {
      return { message: GENERIC_REQUEST_MESSAGE };
    }

    const redis = this.redisService.getClient();
    const cooldown = await redis.set(
      this.cooldownKey(user.id),
      '1',
      'EX',
      this.getCooldownSeconds(),
      'NX',
    );

    if (cooldown !== 'OK') {
      return { message: GENERIC_REQUEST_MESSAGE };
    }

    try {
      await this.issueAndSend(user, context);
    } catch (error: unknown) {
      await redis.del(this.cooldownKey(user.id));
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Password reset delivery failed for user ${user.id}: ${reason}`,
      );

      await this.writeAuditSafe({
        actorUserId: user.id,
        action: 'UPDATE',
        entityType: 'PasswordReset',
        entityId: user.id,
        description: 'Password reset email delivery failed.',
        metadata: {
          event: 'PASSWORD_RESET_DELIVERY_FAILED',
          reason,
        },
        context,
      });
    }

    return { message: GENERIC_REQUEST_MESSAGE };
  }

  async reset(
    token: string,
    newPassword: string,
    context: RequestContext = {},
  ): Promise<{ message: string }> {
    const tokenHash = this.hashToken(token);
    const redis = this.redisService.getClient();
    const tokenKey = this.tokenKey(tokenHash);
    const storedValue = await redis.get(tokenKey);

    if (!storedValue) {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }

    const stored = this.parseStoredToken(storedValue);
    const userKey = this.userKey(stored.userId);
    const currentTokenHash = await redis.get(userKey);
    if (currentTokenHash !== tokenHash) {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        passwordHash: true,
        status: true,
      },
    });

    if (
      !user ||
      !user.emailVerifiedAt ||
      user.status !== 'ACTIVE' ||
      user.email?.toLowerCase() !== stored.email.toLowerCase()
    ) {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }

    const reusesCurrentPassword =
      await this.passwordService.verifyForAuthentication(
        user.passwordHash,
        newPassword,
      );
    if (reusesCurrentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    const consumedPayload = await redis.eval(
      CONSUME_RESET_TOKEN_SCRIPT,
      2,
      tokenKey,
      userKey,
      tokenHash,
    );

    if (typeof consumedPayload !== 'string') {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }

    const consumed = this.parseStoredToken(consumedPayload);
    if (
      consumed.userId !== stored.userId ||
      consumed.email.toLowerCase() !== stored.email.toLowerCase()
    ) {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    const changedAt = new Date();

    try {
      await this.prisma.$transaction(
        async (transaction) => {
          const updated = await transaction.user.updateMany({
            where: {
              id: user.id,
              status: 'ACTIVE',
            },
            data: {
              passwordHash,
              mustChangePassword: false,
            },
          });

          if (updated.count !== 1) {
            throw new BadRequestException(INVALID_RESET_MESSAGE);
          }

          const revoked = await transaction.authSession.updateMany({
            where: {
              userId: user.id,
              revokedAt: null,
            },
            data: {
              revokedAt: changedAt,
              revocationReason: 'PASSWORD_RESET',
            },
          });

          await transaction.auditLog.create({
            data: {
              actorUserId: user.id,
              action: 'UPDATE',
              entityType: 'UserCredential',
              entityId: user.id,
              description: 'User password reset completed.',
              metadata: {
                event: 'PASSWORD_RESET_COMPLETED',
                revokedSessionCount: revoked.count,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      await redis.del(this.cooldownKey(user.id)).catch(() => undefined);
      throw error;
    }

    await redis.del(this.cooldownKey(user.id));

    return {
      message: 'Password reset successfully. Please sign in with your new password.',
    };
  }

  private async issueAndSend(
    user: ResetUser,
    context: RequestContext,
  ): Promise<void> {
    if (!user.email) {
      throw new Error('Email address is required for password recovery.');
    }

    const redis = this.redisService.getClient();
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const ttlSeconds = this.getTtlSeconds();
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
      } satisfies StoredResetToken),
      'EX',
      ttlSeconds,
    );
    await multi.exec();

    const resetUrl = `${this.getPublicAppUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      'FixTradeZone user';
    const ttlMinutes = Math.ceil(ttlSeconds / 60);

    try {
      const delivery = await this.communicationService.sendEmail({
        to: user.email,
        subject: 'Reset your FixTradeZone password',
        text: [
          `Hi ${displayName},`,
          '',
          'A password reset was requested for your FixTradeZone account.',
          resetUrl,
          '',
          `This reset link expires in ${ttlMinutes} minutes and can be used once.`,
          'If you did not request this change, you can ignore this message.',
        ].join('\n'),
        html: `<p>Hi ${this.escapeHtml(displayName)},</p><p>A password reset was requested for your FixTradeZone account.</p><p><a href="${this.escapeHtml(resetUrl)}">Reset Password</a></p><p>This link expires in ${ttlMinutes} minutes and can be used once.</p><p>If you did not request this change, you can ignore this message.</p>`,
      });

      await this.writeAuditSafe({
        actorUserId: user.id,
        action: 'CREATE',
        entityType: 'PasswordReset',
        entityId: user.id,
        description: 'Password reset message issued.',
        metadata: {
          event: 'PASSWORD_RESET_ISSUED',
          transport: delivery.transport,
          ttlSeconds,
        },
        context,
      });
    } catch (error) {
      await redis.del(this.tokenKey(tokenHash), currentKey);
      throw error;
    }
  }

  private parseStoredToken(value: string): StoredResetToken {
    try {
      const parsed = JSON.parse(value) as Partial<StoredResetToken>;
      if (
        typeof parsed.userId !== 'string' ||
        typeof parsed.email !== 'string'
      ) {
        throw new Error('Invalid token payload');
      }
      return { userId: parsed.userId, email: parsed.email };
    } catch {
      throw new BadRequestException(INVALID_RESET_MESSAGE);
    }
  }

  private async writeAuditSafe(input: {
    actorUserId: string;
    action: 'CREATE' | 'UPDATE';
    entityType: string;
    entityId: string;
    description: string;
    metadata: Prisma.InputJsonObject;
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
      this.logger.error(`Failed to record password reset audit: ${reason}`);
    }
  }

  private getTtlSeconds(): number {
    const minutes =
      this.configService.get<number>('PASSWORD_RESET_TTL_MINUTES') ?? 30;
    return Math.max(5, minutes) * 60;
  }

  private getCooldownSeconds(): number {
    return Math.max(
      10,
      this.configService.get<number>(
        'PASSWORD_RESET_RESEND_COOLDOWN_SECONDS',
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
    return `${RESET_KEY_PREFIX}:user:${userId}`;
  }

  private tokenKey(tokenHash: string): string {
    return `${RESET_KEY_PREFIX}:token:${tokenHash}`;
  }

  private cooldownKey(userId: string): string {
    return `${RESET_KEY_PREFIX}:cooldown:${userId}`;
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
