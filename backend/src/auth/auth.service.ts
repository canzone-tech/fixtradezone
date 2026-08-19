import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';
import type { AccessTokenPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const INACTIVE_ACCOUNT_MESSAGE = 'Account is not active.';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === code;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly rbacBootstrapService: RbacBootstrapService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const defaultRole =
          await this.rbacBootstrapService.ensureDefaultUserRole(transaction);

        const user = await transaction.user.create({
          data: {
            email: dto.email,
            passwordHash,
            username: dto.username,
            phone: dto.phone,
            firstName: dto.firstName,
            lastName: dto.lastName,
            roles: {
              create: {
                role: {
                  connect: {
                    id: defaultRole.id,
                  },
                },
              },
            },
          },
          select: {
            id: true,
            email: true,
            username: true,
            phone: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
            roles: {
              select: {
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        });

        await transaction.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'CREATE',
            entityType: 'User',
            entityId: user.id,
            description: 'User completed self-registration.',
            metadata: {
              source: 'SELF_REGISTRATION',
            },
          },
        });

        return {
          message: 'Registration successful.',
          user: {
            ...user,
            roles: user.roles.map((userRole) => userRole.role.name),
          },
        };
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException(
          'An account already exists with one of the supplied identifiers.',
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        username: true,
        phone: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const credentialsAreValid =
      await this.passwordService.verifyForAuthentication(
        user?.passwordHash ?? null,
        dto.password,
      );

    if (!user || !credentialsAreValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(INACTIVE_ACCOUNT_MESSAGE);
    }

    const roles = user.roles
      .filter((userRole) => userRole.role.status === 'ACTIVE')
      .map((userRole) => userRole.role.name);

    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const loggedInAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: {
          id: user.id,
        },
        data: {
          lastLoginAt: loggedInAt,
        },
      });

      await transaction.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          description: 'User authenticated with a password.',
          metadata: {
            source: 'PASSWORD_LOGIN',
            tokenType: 'ACCESS',
          },
        },
      });
    });

    return {
      message: 'Login successful.',
      tokenType: 'Bearer',
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: loggedInAt,
        roles,
      },
    };
  }
}
