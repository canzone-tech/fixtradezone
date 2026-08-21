import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from './auth-user';
import type { RequestContext } from './auth.types';
import { ReauthenticateDto } from './dto';
import { PasswordService } from './password.service';

const REAUTHENTICATION_ERROR = 'Password verification failed.';

@Injectable()
export class ReauthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async reauthenticate(
    user: AuthenticatedUser,
    dto: ReauthenticateDto,
    context: RequestContext = {},
  ) {
    const account = await this.prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        status: true,
        passwordHash: true,
      },
    });

    const passwordMatches = await this.passwordService.verifyForAuthentication(
      account?.passwordHash ?? null,
      dto.password,
    );

    if (!account || account.status !== 'ACTIVE' || !passwordMatches) {
      throw new UnauthorizedException(REAUTHENTICATION_ERROR);
    }

    const reauthenticatedAt = new Date();

    await this.prisma.auditLog.create({
      data: {
        actorUserId: account.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: account.id,
        description: 'Session password reauthentication succeeded.',
        metadata: {
          event: 'SESSION_REAUTHENTICATED',
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return {
      reauthenticated: true,
      reauthenticatedAt,
    };
  }
}
