import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  AUTH_USER_SELECT,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './auth-user';
import type { RequestContext } from './auth.types';
import type { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}

function hasOwn<T extends object>(value: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

@Injectable()
export class OwnProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async update(
    actor: AuthenticatedUser,
    dto: UpdateOwnProfileDto,
    context: RequestContext = {},
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.user.findUnique({
            where: { id: actor.id },
            select: {
              id: true,
              status: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          });

          if (!current || current.status !== 'ACTIVE') {
            throw new ForbiddenException(
              'Only an active account can update its profile.',
            );
          }

          const updateFirstName = hasOwn(dto, 'firstName');
          const updateLastName = hasOwn(dto, 'lastName');
          const updatePhone = hasOwn(dto, 'phone');
          const nextPhone = updatePhone ? (dto.phone ?? null) : current.phone;
          const phoneChanged = updatePhone && nextPhone !== current.phone;

          if (phoneChanged) {
            const registrationConfig =
              await transaction.systemRegistrationConfig.findUnique({
                where: { id: 1 },
                select: { allowMultipleAccountsPerMobile: true },
              });
            const allowMultipleAccountsPerMobile =
              registrationConfig?.allowMultipleAccountsPerMobile ?? false;

            if (!allowMultipleAccountsPerMobile && nextPhone) {
              const duplicate = await transaction.user.findFirst({
                where: {
                  id: { not: actor.id },
                  phone: nextPhone,
                },
                select: { id: true },
              });

              if (duplicate) {
                throw new ConflictException(
                  'This mobile number is already linked to another account.',
                );
              }
            }

            await transaction.userIdentifierClaim.deleteMany({
              where: {
                userId: actor.id,
                type: 'MOBILE',
              },
            });

            if (!allowMultipleAccountsPerMobile && nextPhone) {
              await transaction.userIdentifierClaim.create({
                data: {
                  userId: actor.id,
                  type: 'MOBILE',
                  normalizedValue: nextPhone,
                },
              });
            }
          }

          const data: Prisma.UserUpdateInput = {};
          const changedFields: string[] = [];

          if (updateFirstName) {
            data.firstName = dto.firstName ?? null;
            changedFields.push('firstName');
          }
          if (updateLastName) {
            data.lastName = dto.lastName ?? null;
            changedFields.push('lastName');
          }
          if (updatePhone) {
            data.phone = nextPhone;
            changedFields.push('phone');
          }

          const user =
            changedFields.length > 0
              ? await transaction.user.update({
                  where: { id: actor.id },
                  data,
                  select: AUTH_USER_SELECT,
                })
              : await transaction.user.findUnique({
                  where: { id: actor.id },
                  select: AUTH_USER_SELECT,
                });

          if (!user) {
            throw new ForbiddenException('Account profile is unavailable.');
          }

          if (changedFields.length > 0) {
            await transaction.auditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'UPDATE',
                entityType: 'User',
                entityId: actor.id,
                description: 'User updated optional profile details.',
                metadata: {
                  source: 'SELF_PROFILE',
                  changedFields,
                },
                ipAddress: context.ipAddress,
                userAgent: context.userAgent,
              },
            });
          }

          return {
            message:
              changedFields.length > 0
                ? 'Profile updated successfully.'
                : 'Profile is already up to date.',
            user: toAuthenticatedUser(user),
          };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException(
          'This mobile number is already linked to another account.',
        );
      }

      throw error;
    }
  }
}
