import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SUPER_ADMIN_ROLE_NAME } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { UpdateAuthenticationConfigDto } from './update-authentication-config.dto';
import { UpdateRegistrationConfigDto } from './update-registration-config.dto';

const CONFIG_ID = 1;

type PasswordCreationMode = 'AUTO' | 'MANUAL' | 'AUTO_OR_MANUAL';

type UsernameCreationMode = 'AUTO' | 'MANUAL' | 'AUTO_OR_MANUAL';

type IdentifierClaimType = 'EMAIL' | 'MOBILE';

const PASSWORD_MODES = new Set<PasswordCreationMode>([
  'AUTO',
  'MANUAL',
  'AUTO_OR_MANUAL',
]);

const USERNAME_MODES = new Set<UsernameCreationMode>([
  'AUTO',
  'MANUAL',
  'AUTO_OR_MANUAL',
]);

export interface AuthenticationConfigSnapshot {
  loginWithUsername: boolean;
  loginWithEmail: boolean;
  loginWithMobile: boolean;
  captchaOnLoginEnabled: boolean;
  captchaOnRegistrationEnabled: boolean;
  updatedAt: Date | null;
}

export interface RegistrationConfigSnapshot {
  publicRegistrationEnabled: boolean;
  superAdminRegistrationEnabled: boolean;
  adminRegistrationEnabled: boolean;
  authorizedUserRegistrationEnabled: boolean;
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: PasswordCreationMode;
  usernameMode: UsernameCreationMode;
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
  allowMultipleAccountsPerEmail: boolean;
  allowMultipleAccountsPerMobile: boolean;
  updatedAt: Date | null;
}

interface AuthenticationConfigRow {
  loginWithUsername: boolean;
  loginWithEmail: boolean;
  loginWithMobile: boolean;
  captchaOnLoginEnabled: boolean;
  captchaOnRegistrationEnabled: boolean;
  updatedAt: Date;
}

interface RegistrationConfigRow {
  publicRegistrationEnabled: boolean;
  superAdminRegistrationEnabled: boolean;
  adminRegistrationEnabled: boolean;
  authorizedUserRegistrationEnabled: boolean;
  emailRequired: boolean;
  mobileRequired: boolean;
  passwordMode: PasswordCreationMode;
  usernameMode: UsernameCreationMode;
  usernamePrefixEnabled: boolean;
  usernamePrefix: string | null;
  allowMultipleAccountsPerEmail: boolean;
  allowMultipleAccountsPerMobile: boolean;
  updatedAt: Date;
}

@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthentication(): Promise<AuthenticationConfigSnapshot> {
    const config = await this.prisma.systemAuthConfig.findUnique({
      where: {
        id: CONFIG_ID,
      },
    });

    return this.toAuthenticationSnapshot(config);
  }

  async getRegistration(): Promise<RegistrationConfigSnapshot> {
    const config = await this.prisma.systemRegistrationConfig.findUnique({
      where: {
        id: CONFIG_ID,
      },
    });

    return this.toRegistrationSnapshot(config);
  }

  async updateAuthentication(
    settings: UpdateAuthenticationConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    this.assertNonEmptyUpdate(settings, 'authentication');

    return this.prisma.$transaction(
      async (transaction) => {
        const [previousRow, registrationRow] = await Promise.all([
          transaction.systemAuthConfig.findUnique({
            where: {
              id: CONFIG_ID,
            },
          }),
          transaction.systemRegistrationConfig.findUnique({
            where: {
              id: CONFIG_ID,
            },
          }),
        ]);

        const previous = this.toAuthenticationSnapshot(previousRow);

        const registration = this.toRegistrationSnapshot(registrationRow);

        const next: AuthenticationConfigSnapshot = {
          loginWithUsername:
            settings.loginWithUsername ?? previous.loginWithUsername,
          loginWithEmail: settings.loginWithEmail ?? previous.loginWithEmail,
          loginWithMobile: settings.loginWithMobile ?? previous.loginWithMobile,
          captchaOnLoginEnabled:
            settings.captchaOnLoginEnabled ?? previous.captchaOnLoginEnabled,
          captchaOnRegistrationEnabled:
            settings.captchaOnRegistrationEnabled ??
            previous.captchaOnRegistrationEnabled,
          updatedAt: previous.updatedAt,
        };

        this.assertAuthenticationInvariant(next, registration);

        const config = await transaction.systemAuthConfig.upsert({
          where: {
            id: CONFIG_ID,
          },
          create: {
            id: CONFIG_ID,
            loginWithUsername: next.loginWithUsername,
            loginWithEmail: next.loginWithEmail,
            loginWithMobile: next.loginWithMobile,
            captchaOnLoginEnabled: next.captchaOnLoginEnabled,
            captchaOnRegistrationEnabled: next.captchaOnRegistrationEnabled,
            updatedByUserId: actor.id,
          },
          update: {
            loginWithUsername: next.loginWithUsername,
            loginWithEmail: next.loginWithEmail,
            loginWithMobile: next.loginWithMobile,
            captchaOnLoginEnabled: next.captchaOnLoginEnabled,
            captchaOnRegistrationEnabled: next.captchaOnRegistrationEnabled,
            updatedByUserId: actor.id,
          },
        });

        const current = this.toAuthenticationSnapshot(config);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemAuthConfig',
            entityId: String(CONFIG_ID),
            description:
              'SUPER_ADMIN updated platform authentication configuration.',
            metadata: {
              source: 'ADMIN_AUTHENTICATION_CONFIG',
              previous: this.authenticationPolicy(previous),
              current: this.authenticationPolicy(current),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Authentication configuration updated.',
          ...current,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  async updateRegistration(
    settings: UpdateRegistrationConfigDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    this.assertSuperAdmin(actor);
    this.assertNonEmptyUpdate(settings, 'registration');

    return this.prisma.$transaction(
      async (transaction) => {
        const [previousRow, authenticationRow] = await Promise.all([
          transaction.systemRegistrationConfig.findUnique({
            where: {
              id: CONFIG_ID,
            },
          }),
          transaction.systemAuthConfig.findUnique({
            where: {
              id: CONFIG_ID,
            },
          }),
        ]);

        const previous = this.toRegistrationSnapshot(previousRow);

        const authentication = this.toAuthenticationSnapshot(authenticationRow);

        const next: RegistrationConfigSnapshot = {
          publicRegistrationEnabled:
            settings.publicRegistrationEnabled ??
            previous.publicRegistrationEnabled,
          superAdminRegistrationEnabled:
            settings.superAdminRegistrationEnabled ??
            previous.superAdminRegistrationEnabled,
          adminRegistrationEnabled:
            settings.adminRegistrationEnabled ??
            previous.adminRegistrationEnabled,
          authorizedUserRegistrationEnabled:
            settings.authorizedUserRegistrationEnabled ??
            previous.authorizedUserRegistrationEnabled,
          emailRequired: settings.emailRequired ?? previous.emailRequired,
          mobileRequired: settings.mobileRequired ?? previous.mobileRequired,
          passwordMode: settings.passwordMode ?? previous.passwordMode,
          usernameMode: settings.usernameMode ?? previous.usernameMode,
          usernamePrefixEnabled:
            settings.usernamePrefixEnabled ?? previous.usernamePrefixEnabled,
          usernamePrefix:
            settings.usernamePrefix !== undefined
              ? settings.usernamePrefix.trim().toLowerCase()
              : previous.usernamePrefix,
          allowMultipleAccountsPerEmail:
            settings.allowMultipleAccountsPerEmail ??
            previous.allowMultipleAccountsPerEmail,
          allowMultipleAccountsPerMobile:
            settings.allowMultipleAccountsPerMobile ??
            previous.allowMultipleAccountsPerMobile,
          updatedAt: previous.updatedAt,
        };

        this.assertRegistrationInvariant(next, authentication);

        await this.applyIdentifierMultiplicityTransition(
          transaction,
          'EMAIL',
          previous.allowMultipleAccountsPerEmail,
          next.allowMultipleAccountsPerEmail,
        );

        await this.applyIdentifierMultiplicityTransition(
          transaction,
          'MOBILE',
          previous.allowMultipleAccountsPerMobile,
          next.allowMultipleAccountsPerMobile,
        );

        const config = await transaction.systemRegistrationConfig.upsert({
          where: {
            id: CONFIG_ID,
          },
          create: {
            id: CONFIG_ID,
            publicRegistrationEnabled: next.publicRegistrationEnabled,
            superAdminRegistrationEnabled: next.superAdminRegistrationEnabled,
            adminRegistrationEnabled: next.adminRegistrationEnabled,
            authorizedUserRegistrationEnabled:
              next.authorizedUserRegistrationEnabled,
            emailRequired: next.emailRequired,
            mobileRequired: next.mobileRequired,
            passwordMode: next.passwordMode,
            usernameMode: next.usernameMode,
            usernamePrefixEnabled: next.usernamePrefixEnabled,
            usernamePrefix: next.usernamePrefix,
            allowMultipleAccountsPerEmail: next.allowMultipleAccountsPerEmail,
            allowMultipleAccountsPerMobile: next.allowMultipleAccountsPerMobile,
            updatedByUserId: actor.id,
          },
          update: {
            publicRegistrationEnabled: next.publicRegistrationEnabled,
            superAdminRegistrationEnabled: next.superAdminRegistrationEnabled,
            adminRegistrationEnabled: next.adminRegistrationEnabled,
            authorizedUserRegistrationEnabled:
              next.authorizedUserRegistrationEnabled,
            emailRequired: next.emailRequired,
            mobileRequired: next.mobileRequired,
            passwordMode: next.passwordMode,
            usernameMode: next.usernameMode,
            usernamePrefixEnabled: next.usernamePrefixEnabled,
            usernamePrefix: next.usernamePrefix,
            allowMultipleAccountsPerEmail: next.allowMultipleAccountsPerEmail,
            allowMultipleAccountsPerMobile: next.allowMultipleAccountsPerMobile,
            updatedByUserId: actor.id,
          },
        });

        const current = this.toRegistrationSnapshot(config);

        await transaction.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'UPDATE',
            entityType: 'SystemRegistrationConfig',
            entityId: String(CONFIG_ID),
            description:
              'SUPER_ADMIN updated platform registration configuration.',
            metadata: {
              source: 'ADMIN_REGISTRATION_CONFIG',
              previous: this.registrationPolicy(previous),
              current: this.registrationPolicy(current),
            },
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
          },
        });

        return {
          message: 'Registration configuration updated.',
          ...current,
        };
      },
      {
        isolationLevel: 'Serializable',
      },
    );
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.roles.includes(SUPER_ADMIN_ROLE_NAME)) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can modify platform configuration.',
      );
    }
  }

  private assertNonEmptyUpdate(settings: object, name: string): void {
    const supplied = Object.values(settings).some(
      (value) => value !== undefined,
    );

    if (!supplied) {
      throw new BadRequestException(
        `At least one ${name} setting must be supplied.`,
      );
    }
  }

  private assertAuthenticationInvariant(
    authentication: AuthenticationConfigSnapshot,
    registration: RegistrationConfigSnapshot,
  ): void {
    if (
      !authentication.loginWithUsername &&
      !authentication.loginWithEmail &&
      !authentication.loginWithMobile
    ) {
      throw new BadRequestException(
        'At least one login method must remain enabled.',
      );
    }

    if (
      this.isMultiAccountMode(registration) &&
      !this.isUsernameOnlyAuthentication(authentication)
    ) {
      throw new BadRequestException(
        'Multi-account mode requires username-only login. Disable email and mobile login and keep username login enabled first.',
      );
    }
  }

  private assertRegistrationInvariant(
    registration: RegistrationConfigSnapshot,
    authentication: AuthenticationConfigSnapshot,
  ): void {
    if (!PASSWORD_MODES.has(registration.passwordMode)) {
      throw new BadRequestException('Invalid password creation mode.');
    }

    if (!USERNAME_MODES.has(registration.usernameMode)) {
      throw new BadRequestException('Invalid username creation mode.');
    }

    if (registration.usernamePrefixEnabled) {
      const prefix = registration.usernamePrefix?.trim().toLowerCase();

      if (!prefix || !/^[a-z0-9_-]{1,20}$/.test(prefix)) {
        throw new BadRequestException(
          'A valid username prefix is required when username prefixing is enabled.',
        );
      }
    }

    if (
      this.isMultiAccountMode(registration) &&
      !this.isUsernameOnlyAuthentication(authentication)
    ) {
      throw new BadRequestException(
        'Enable username-only authentication before enabling multi-account mode.',
      );
    }
  }

  private isMultiAccountMode(
    registration: RegistrationConfigSnapshot,
  ): boolean {
    return (
      registration.allowMultipleAccountsPerEmail ||
      registration.allowMultipleAccountsPerMobile
    );
  }

  private isUsernameOnlyAuthentication(
    authentication: AuthenticationConfigSnapshot,
  ): boolean {
    return (
      authentication.loginWithUsername &&
      !authentication.loginWithEmail &&
      !authentication.loginWithMobile
    );
  }

  private async applyIdentifierMultiplicityTransition(
    transaction: Prisma.TransactionClient,
    type: IdentifierClaimType,
    previousAllowsMultiple: boolean,
    nextAllowsMultiple: boolean,
  ): Promise<void> {
    if (previousAllowsMultiple === nextAllowsMultiple) {
      return;
    }

    if (nextAllowsMultiple) {
      await transaction.userIdentifierClaim.deleteMany({
        where: {
          type,
        },
      });

      return;
    }

    const duplicateRows =
      type === 'EMAIL'
        ? await transaction.$queryRaw<Array<{ normalizedValue: string }>>`
            SELECT LOWER(TRIM(\`email\`)) AS normalizedValue
            FROM \`users\`
            WHERE \`email\` IS NOT NULL
              AND TRIM(\`email\`) <> ''
            GROUP BY LOWER(TRIM(\`email\`))
            HAVING COUNT(*) > 1
            LIMIT 1
          `
        : await transaction.$queryRaw<Array<{ normalizedValue: string }>>`
            SELECT TRIM(\`phone\`) AS normalizedValue
            FROM \`users\`
            WHERE \`phone\` IS NOT NULL
              AND TRIM(\`phone\`) <> ''
            GROUP BY TRIM(\`phone\`)
            HAVING COUNT(*) > 1
            LIMIT 1
          `;

    if (duplicateRows.length > 0) {
      throw new BadRequestException(
        type === 'EMAIL'
          ? 'Single-account email mode cannot be enabled while duplicate email addresses exist.'
          : 'Single-account mobile mode cannot be enabled while duplicate mobile numbers exist.',
      );
    }

    await transaction.userIdentifierClaim.deleteMany({
      where: {
        type,
      },
    });

    if (type === 'EMAIL') {
      await transaction.$executeRaw`
        INSERT INTO \`user_identifier_claims\`
          (
            \`id\`,
            \`userId\`,
            \`type\`,
            \`normalizedValue\`,
            \`createdAt\`
          )
        SELECT
          UUID(),
          \`id\`,
          'EMAIL',
          LOWER(TRIM(\`email\`)),
          CURRENT_TIMESTAMP(3)
        FROM \`users\`
        WHERE \`email\` IS NOT NULL
          AND TRIM(\`email\`) <> ''
      `;
    } else {
      await transaction.$executeRaw`
        INSERT INTO \`user_identifier_claims\`
          (
            \`id\`,
            \`userId\`,
            \`type\`,
            \`normalizedValue\`,
            \`createdAt\`
          )
        SELECT
          UUID(),
          \`id\`,
          'MOBILE',
          TRIM(\`phone\`),
          CURRENT_TIMESTAMP(3)
        FROM \`users\`
        WHERE \`phone\` IS NOT NULL
          AND TRIM(\`phone\`) <> ''
      `;
    }
  }

  private toAuthenticationSnapshot(
    row: AuthenticationConfigRow | null,
  ): AuthenticationConfigSnapshot {
    return {
      loginWithUsername: row?.loginWithUsername ?? true,
      loginWithEmail: row?.loginWithEmail ?? true,
      loginWithMobile: row?.loginWithMobile ?? true,
      captchaOnLoginEnabled: row?.captchaOnLoginEnabled ?? false,
      captchaOnRegistrationEnabled: row?.captchaOnRegistrationEnabled ?? false,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private toRegistrationSnapshot(
    row: RegistrationConfigRow | null,
  ): RegistrationConfigSnapshot {
    return {
      publicRegistrationEnabled: row?.publicRegistrationEnabled ?? true,
      superAdminRegistrationEnabled: row?.superAdminRegistrationEnabled ?? true,
      adminRegistrationEnabled: row?.adminRegistrationEnabled ?? true,
      authorizedUserRegistrationEnabled:
        row?.authorizedUserRegistrationEnabled ?? false,
      emailRequired: row?.emailRequired ?? true,
      mobileRequired: row?.mobileRequired ?? false,
      passwordMode: row?.passwordMode ?? 'MANUAL',
      usernameMode: row?.usernameMode ?? 'AUTO_OR_MANUAL',
      usernamePrefixEnabled: row?.usernamePrefixEnabled ?? false,
      usernamePrefix: row?.usernamePrefix ?? null,
      allowMultipleAccountsPerEmail:
        row?.allowMultipleAccountsPerEmail ?? false,
      allowMultipleAccountsPerMobile:
        row?.allowMultipleAccountsPerMobile ?? false,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private authenticationPolicy(config: AuthenticationConfigSnapshot) {
    return {
      loginWithUsername: config.loginWithUsername,
      loginWithEmail: config.loginWithEmail,
      loginWithMobile: config.loginWithMobile,
      captchaOnLoginEnabled: config.captchaOnLoginEnabled,
      captchaOnRegistrationEnabled: config.captchaOnRegistrationEnabled,
    };
  }

  private registrationPolicy(config: RegistrationConfigSnapshot) {
    return {
      publicRegistrationEnabled: config.publicRegistrationEnabled,
      superAdminRegistrationEnabled: config.superAdminRegistrationEnabled,
      adminRegistrationEnabled: config.adminRegistrationEnabled,
      authorizedUserRegistrationEnabled:
        config.authorizedUserRegistrationEnabled,
      emailRequired: config.emailRequired,
      mobileRequired: config.mobileRequired,
      passwordMode: config.passwordMode,
      usernameMode: config.usernameMode,
      usernamePrefixEnabled: config.usernamePrefixEnabled,
      usernamePrefix: config.usernamePrefix,
      allowMultipleAccountsPerEmail: config.allowMultipleAccountsPerEmail,
      allowMultipleAccountsPerMobile: config.allowMultipleAccountsPerMobile,
    };
  }
}
