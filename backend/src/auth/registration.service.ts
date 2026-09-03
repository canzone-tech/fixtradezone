import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ReferralsService } from '../referrals/referrals.service';
import { PERMISSIONS } from '../rbac/rbac.constants';
import { ADMIN_ROLE_NAME, SUPER_ADMIN_ROLE_NAME } from './auth.constants';
import {
  AUTH_USER_SELECT,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './auth-user';
import type { RequestContext } from './auth.types';
import type { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';

const USERNAME_SEQUENCE_KEY = 'username';
const USERNAME_SEQUENCE_START = 100001n;
const AUTO_USERNAME_ATTEMPTS = 100;
const REGISTRATION_DECLARATION_POLICY_VERSION = 'CLIENT_REVISION_2026_09_V1';

type RegistrationSource =
  'SELF_REGISTRATION' | 'SUPER_ADMIN' | 'ADMIN' | 'AUTHORIZED_USER';

interface RegistrationConfig {
  publicRegistrationEnabled: boolean;
  superAdminRegistrationEnabled: boolean;
  adminRegistrationEnabled: boolean;
  authorizedUserRegistrationEnabled: boolean;
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: 'AUTO' | 'MANUAL' | 'AUTO_OR_MANUAL';
  usernameMode: 'AUTO' | 'MANUAL' | 'AUTO_OR_MANUAL';
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
  allowMultipleAccountsPerEmail: boolean;
  allowMultipleAccountsPerMobile: boolean;
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly rbacBootstrapService: RbacBootstrapService,
    @Optional() private readonly referralsService?: ReferralsService,
    @Optional()
    private readonly emailVerificationService?: EmailVerificationService,
  ) {}

  async registerPublic(dto: RegisterDto, context: RequestContext = {}) {
    const result = await this.register(dto, null, context);

    const delivery = this.emailVerificationService
      ? await this.emailVerificationService.sendInitial(result.user, context)
      : { sent: false };

    return {
      ...result,
      message: delivery.sent
        ? 'Registration successful. Check your email to verify and activate your account.'
        : 'Registration successful. Email verification is required; use resend if the message is not delivered.',
      emailVerificationRequired: true,
      verificationEmailSent: delivery.sent,
      verificationStatus: result.user.email
        ? 'PENDING_EMAIL_VERIFICATION'
        : 'PENDING',
    };
  }

  async getPublicRegistrationPolicy() {
    const config = await this.prisma.systemRegistrationConfig.findUnique({
      where: { id: 1 },
    });

    return {
      publicRegistrationEnabled: config?.publicRegistrationEnabled ?? true,
      emailRequired: true,
      mobileRequired: false,
      passwordMode: config?.passwordMode ?? 'MANUAL',
      usernameMode: config?.usernameMode ?? 'AUTO_OR_MANUAL',
      usernamePrefixEnabled: config?.usernamePrefixEnabled ?? false,
      usernamePrefix: config?.usernamePrefix ?? null,
      age18DeclarationRequired: true,
      kycDeclarationRequired: true,
      emailVerificationRequired: true,
      declarationPolicyVersion: REGISTRATION_DECLARATION_POLICY_VERSION,
    };
  }

  registerDashboard(
    dto: RegisterDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    return this.register(dto, actor, context);
  }

  private async register(
    dto: RegisterDto,
    actor: AuthenticatedUser | null,
    context: RequestContext,
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const config = await transaction.systemRegistrationConfig.findUnique({
            where: { id: 1 },
          });

          const policy: RegistrationConfig = {
            publicRegistrationEnabled:
              config?.publicRegistrationEnabled ?? true,
            superAdminRegistrationEnabled:
              config?.superAdminRegistrationEnabled ?? true,
            adminRegistrationEnabled: config?.adminRegistrationEnabled ?? true,
            authorizedUserRegistrationEnabled:
              config?.authorizedUserRegistrationEnabled ?? false,
            emailRequired: config?.emailRequired ?? true,
            mobileRequired: config?.mobileRequired ?? false,
            passwordMode: config?.passwordMode ?? 'MANUAL',
            usernameMode: config?.usernameMode ?? 'AUTO_OR_MANUAL',
            usernamePrefixEnabled: config?.usernamePrefixEnabled ?? false,
            usernamePrefix: config?.usernamePrefix ?? null,
            allowMultipleAccountsPerEmail:
              config?.allowMultipleAccountsPerEmail ?? false,
            allowMultipleAccountsPerMobile:
              config?.allowMultipleAccountsPerMobile ?? false,
          };

          const source = this.assertRegistrationAllowed(actor, policy);
          this.assertRequiredIdentifiers(dto, policy, source);
          this.assertPublicDeclarations(dto, source);

          if (source === 'SELF_REGISTRATION' && dto.email) {
            const existingEmailUser = await transaction.user.findFirst({
              where: {
                email: dto.email.trim().toLowerCase(),
              },
              select: { id: true },
            });

            if (existingEmailUser) {
              throw new ConflictException(
                'An account already exists with one of the supplied unique identifiers.',
              );
            }
          }

          const passwordResult = this.resolvePassword(dto, policy);
          const passwordHash = await this.passwordService.hash(
            passwordResult.password,
          );
          const username = await this.resolveUsername(transaction, dto, policy);
          const defaultRole =
            await this.rbacBootstrapService.ensureDefaultUserRole(transaction);

          const user = await transaction.user.create({
            data: {
              email: dto.email ?? null,
              username,
              phone: dto.phone ?? null,
              passwordHash,
              mustChangePassword: passwordResult.generated,
              firstName: dto.firstName,
              lastName: dto.lastName,
              status: 'PENDING',
              roles: {
                create: {
                  role: {
                    connect: { id: defaultRole.id },
                  },
                },
              },
            },
            select: AUTH_USER_SELECT,
          });

          if (
            dto.email &&
            (source === 'SELF_REGISTRATION' ||
              !policy.allowMultipleAccountsPerEmail)
          ) {
            await transaction.userIdentifierClaim.create({
              data: {
                userId: user.id,
                type: 'EMAIL',
                normalizedValue: dto.email.trim().toLowerCase(),
              },
            });
          }

          if (dto.phone && !policy.allowMultipleAccountsPerMobile) {
            await transaction.userIdentifierClaim.create({
              data: {
                userId: user.id,
                type: 'MOBILE',
                normalizedValue: dto.phone.trim(),
              },
            });
          }

          const referralEnrollment = this.referralsService
            ? await this.referralsService.enrollRegisteredUser(
                transaction,
                { id: user.id, username: user.username },
                dto.referralCode,
              )
            : null;

          await transaction.auditLog.create({
            data: {
              actorUserId: actor?.id ?? user.id,
              action: 'CREATE',
              entityType: 'User',
              entityId: user.id,
              description:
                actor === null
                  ? 'User completed self-registration.'
                  : 'Authorized account creator registered a platform user.',
              metadata: {
                source,
                createdByUserId: actor?.id ?? null,
                generatedUsername:
                  !dto.username || policy.usernameMode === 'AUTO',
                generatedPassword: passwordResult.generated,
                ...(source === 'SELF_REGISTRATION'
                  ? {
                      declarationPolicyVersion:
                        REGISTRATION_DECLARATION_POLICY_VERSION,
                      age18Declared: true,
                      kycDeclarationAccepted: true,
                      emailVerificationRequired: true,
                    }
                  : {}),
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
          });

          return {
            message: 'Registration successful.',
            user: toAuthenticatedUser(user),
            ...(referralEnrollment ? { referral: referralEnrollment } : {}),
            ...(passwordResult.generated
              ? {
                  temporaryPassword: passwordResult.password,
                  mustChangePassword: true,
                }
              : {}),
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException(
          'An account already exists with one of the supplied unique identifiers.',
        );
      }

      throw error;
    }
  }

  private assertRegistrationAllowed(
    actor: AuthenticatedUser | null,
    config: RegistrationConfig,
  ): RegistrationSource {
    if (actor === null) {
      if (!config.publicRegistrationEnabled) {
        throw new ForbiddenException(
          'Public registration is currently disabled.',
        );
      }
      return 'SELF_REGISTRATION';
    }

    if (actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      if (!config.superAdminRegistrationEnabled) {
        throw new ForbiddenException(
          'SUPER_ADMIN registration is currently disabled.',
        );
      }
      return 'SUPER_ADMIN';
    }

    if (actor.roles.includes(ADMIN_ROLE_NAME)) {
      if (!config.adminRegistrationEnabled) {
        throw new ForbiddenException(
          'ADMIN registration is currently disabled.',
        );
      }
      return 'ADMIN';
    }

    if (
      !config.authorizedUserRegistrationEnabled ||
      !actor.permissions.includes(PERMISSIONS.USERS_CREATE)
    ) {
      throw new ForbiddenException(
        'This user is not authorized to register accounts.',
      );
    }

    return 'AUTHORIZED_USER';
  }

  private assertRequiredIdentifiers(
    dto: RegisterDto,
    config: RegistrationConfig,
    source: RegistrationSource,
  ): void {
    if (source === 'SELF_REGISTRATION' && !dto.email) {
      throw new BadRequestException(
        'Email is required for public registration and verification.',
      );
    }

    if (source !== 'SELF_REGISTRATION' && config.emailRequired && !dto.email) {
      throw new BadRequestException(
        'Email is required by the current registration policy.',
      );
    }

    if (source !== 'SELF_REGISTRATION' && config.mobileRequired && !dto.phone) {
      throw new BadRequestException(
        'Mobile number is required by the current registration policy.',
      );
    }
  }

  private assertPublicDeclarations(
    dto: RegisterDto,
    source: RegistrationSource,
  ): void {
    if (source !== 'SELF_REGISTRATION') {
      return;
    }

    if (dto.age18Declared !== true) {
      throw new BadRequestException(
        'You must declare that you are 18 years of age or older.',
      );
    }

    if (dto.kycDeclarationAccepted !== true) {
      throw new BadRequestException(
        'You must accept the identity and future KYC verification declaration.',
      );
    }
  }

  private resolvePassword(
    dto: RegisterDto,
    config: RegistrationConfig,
  ): { password: string; generated: boolean } {
    if (config.passwordMode === 'AUTO') {
      if (dto.password !== undefined) {
        throw new BadRequestException(
          'Manual password entry is disabled by the current registration policy.',
        );
      }
      return {
        password: this.passwordService.generateTemporaryPassword(),
        generated: true,
      };
    }

    if (config.passwordMode === 'MANUAL') {
      if (!dto.password) {
        throw new BadRequestException(
          'Password is required by the current registration policy.',
        );
      }
      return { password: dto.password, generated: false };
    }

    if (dto.password) {
      return { password: dto.password, generated: false };
    }

    return {
      password: this.passwordService.generateTemporaryPassword(),
      generated: true,
    };
  }

  private async resolveUsername(
    transaction: Prisma.TransactionClient,
    dto: RegisterDto,
    config: RegistrationConfig,
  ): Promise<string> {
    const suppliedUsername = dto.username?.trim().toLowerCase();

    if (config.usernameMode === 'MANUAL') {
      if (!suppliedUsername) {
        throw new BadRequestException(
          'Username is required by the current registration policy.',
        );
      }
      return suppliedUsername;
    }

    if (config.usernameMode === 'AUTO') {
      if (suppliedUsername) {
        throw new BadRequestException(
          'Manual username entry is disabled by the current registration policy.',
        );
      }
      return this.generateUsername(transaction, config);
    }

    if (suppliedUsername) {
      return suppliedUsername;
    }
    return this.generateUsername(transaction, config);
  }

  private async generateUsername(
    transaction: Prisma.TransactionClient,
    config: RegistrationConfig,
  ): Promise<string> {
    await transaction.systemSequence.upsert({
      where: { key: USERNAME_SEQUENCE_KEY },
      create: {
        key: USERNAME_SEQUENCE_KEY,
        nextValue: USERNAME_SEQUENCE_START,
      },
      update: {},
    });

    const rows = await transaction.$queryRaw<Array<{ nextValue: bigint }>>`
      SELECT \`nextValue\`
      FROM \`system_sequences\`
      WHERE \`key\` = ${USERNAME_SEQUENCE_KEY}
      FOR UPDATE
    `;

    if (rows.length !== 1) {
      throw new Error('Username sequence is unavailable.');
    }

    let nextValue = BigInt(rows[0].nextValue);
    const prefix = config.usernamePrefixEnabled
      ? (config.usernamePrefix ?? '').trim().toLowerCase()
      : '';

    if (config.usernamePrefixEnabled && !/^[a-z0-9_-]{1,20}$/.test(prefix)) {
      throw new Error('Configured username prefix is invalid.');
    }

    for (let attempt = 0; attempt < AUTO_USERNAME_ATTEMPTS; attempt += 1) {
      const candidate = `${prefix}${nextValue.toString()}`;
      nextValue += 1n;

      if (candidate.length > 100) {
        throw new Error('Generated username exceeds the supported length.');
      }

      const existing = await transaction.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });

      if (!existing) {
        await transaction.systemSequence.update({
          where: { key: USERNAME_SEQUENCE_KEY },
          data: { nextValue },
        });
        return candidate;
      }
    }

    throw new ConflictException('Unable to allocate a unique username.');
  }
}
