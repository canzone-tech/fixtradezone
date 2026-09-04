import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { RequestContext } from './auth.types';
import { PasswordService } from './password.service';

@Injectable()
export class ChangePasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async change(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: RequestContext = {},
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication is required.');
    }

    const currentMatches = await this.passwordService.verifyForAuthentication(
      user.passwordHash,
      currentPassword,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect.');
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

    const passwordHash = await this.passwordService.hash(newPassword);
    const changedAt = new Date();

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
          throw new UnauthorizedException('Authentication is required.');
        }

        const revoked = await transaction.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
          },
          data: {
            revokedAt: changedAt,
            revocationReason: 'PASSWORD_CHANGED',
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'UPDATE',
            entityType: 'UserCredential',
            entityId: user.id,
            description: 'Authenticated user changed their password.',
            metadata: {
              event: 'PASSWORD_CHANGED',
              revokedSessionCount: revoked.count,
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    return {
      message: 'Password changed successfully. Please sign in again.',
    };
  }
}
