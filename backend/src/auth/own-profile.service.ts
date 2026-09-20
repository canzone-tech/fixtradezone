import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isValidDepositAddress } from '../deposits/deposit.validation';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  AUTH_USER_SELECT,
  type AuthenticatedUser,
  toAuthenticatedUser,
} from './auth-user';
import type { RequestContext } from './auth.types';
import type { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

const WITHDRAWAL_ASSET = 'USDT';
const WITHDRAWAL_NETWORK_CODE = 'BEP20';
const WITHDRAWAL_NETWORK_DISPLAY = 'BNB Smart Chain (BEP-20)';
const WITHDRAWAL_VALIDATION_PROFILE = 'EVM';
const WITHDRAWAL_LOCK_DAYS = 30;

interface WithdrawalProfileRow {
  userId: string;
  asset: string;
  networkCode: string;
  validationProfile: string;
  destinationAddress: string;
  savedAt: Date;
  lockedUntil: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

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

  async getCompletion(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new ForbiddenException('Account profile is unavailable.');
    }

    const withdrawal = await this.readWithdrawalProfile(this.prisma, userId);

    return {
      profileCompletion: this.completionSnapshot(user, withdrawal),
    };
  }

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
              emailVerifiedAt: true,
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
          const updateWithdrawalAddress = hasOwn(dto, 'withdrawalAddress');
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

          let withdrawal = await this.readWithdrawalProfile(
            transaction,
            actor.id,
            true,
          );
          let withdrawalLockChanged = false;

          if (updateWithdrawalAddress) {
            const nextAddress = dto.withdrawalAddress?.trim() ?? '';

            if (!nextAddress) {
              throw new BadRequestException(
                'USDT BEP-20 withdrawal address is required.',
              );
            }
            if (!isValidDepositAddress('EVM', nextAddress)) {
              throw new BadRequestException(
                'Withdrawal address must be a valid BNB Smart Chain (BEP-20) address.',
              );
            }

            if (!withdrawal) {
              await transaction.$executeRaw`
                INSERT INTO user_withdrawal_profiles (
                  userId,
                  asset,
                  networkCode,
                  validationProfile,
                  destinationAddress,
                  savedAt,
                  lockedUntil,
                  revision,
                  createdAt,
                  updatedAt
                ) VALUES (
                  ${actor.id},
                  ${WITHDRAWAL_ASSET},
                  ${WITHDRAWAL_NETWORK_CODE},
                  ${WITHDRAWAL_VALIDATION_PROFILE},
                  ${nextAddress},
                  CURRENT_TIMESTAMP(3),
                  DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${WITHDRAWAL_LOCK_DAYS} DAY),
                  1,
                  CURRENT_TIMESTAMP(3),
                  CURRENT_TIMESTAMP(3)
                )
              `;
              changedFields.push('withdrawalAddress');
              withdrawalLockChanged = true;
            } else if (withdrawal.destinationAddress !== nextAddress) {
              if (withdrawal.lockedUntil.getTime() > Date.now()) {
                throw new ConflictException(
                  `Withdrawal address is locked until ${withdrawal.lockedUntil.toISOString()}.`,
                );
              }

              const updated = await transaction.$executeRaw`
                UPDATE user_withdrawal_profiles
                SET
                  destinationAddress = ${nextAddress},
                  savedAt = CURRENT_TIMESTAMP(3),
                  lockedUntil = DATE_ADD(
                    CURRENT_TIMESTAMP(3),
                    INTERVAL ${WITHDRAWAL_LOCK_DAYS} DAY
                  ),
                  revision = revision + 1,
                  updatedAt = CURRENT_TIMESTAMP(3)
                WHERE userId = ${actor.id}
                  AND revision = ${withdrawal.revision}
              `;

              if (updated !== 1) {
                throw new ConflictException(
                  'Withdrawal address changed concurrently. Reload and try again.',
                );
              }
              changedFields.push('withdrawalAddress');
              withdrawalLockChanged = true;
            }

            withdrawal = await this.readWithdrawalProfile(
              transaction,
              actor.id,
              true,
            );
          }

          if (changedFields.length > 0) {
            await transaction.auditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'UPDATE',
                entityType: 'User',
                entityId: actor.id,
                description: 'User updated profile details.',
                metadata: {
                  source: 'SELF_PROFILE',
                  changedFields,
                  withdrawalNetwork: withdrawal
                    ? WITHDRAWAL_NETWORK_DISPLAY
                    : null,
                  withdrawalAddressLockedUntil:
                    withdrawalLockChanged && withdrawal
                      ? withdrawal.lockedUntil.toISOString()
                      : null,
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
            profileCompletion: this.completionSnapshot(
              {
                firstName: user.firstName,
                lastName: user.lastName,
                phone: user.phone,
                emailVerifiedAt: current.emailVerifiedAt,
              },
              withdrawal,
            ),
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

  private async readWithdrawalProfile(
    client: PrismaService | Prisma.TransactionClient,
    userId: string,
    lock = false,
  ): Promise<WithdrawalProfileRow | null> {
    const lockSql = lock ? ' FOR UPDATE' : '';
    const rows = await client.$queryRawUnsafe<WithdrawalProfileRow[]>(
      `SELECT * FROM user_withdrawal_profiles WHERE userId = ? LIMIT 1${lockSql}`,
      userId,
    );
    return rows[0] ?? null;
  }

  private completionSnapshot(
    user: {
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      emailVerifiedAt: Date | null;
    },
    withdrawal: WithdrawalProfileRow | null,
  ) {
    const missingFields: string[] = [];
    if (!user.firstName?.trim()) missingFields.push('FIRST_NAME');
    if (!user.lastName?.trim()) missingFields.push('LAST_NAME');
    if (!user.phone?.trim()) missingFields.push('MOBILE_NUMBER');
    if (!withdrawal?.destinationAddress.trim()) {
      missingFields.push('WITHDRAWAL_ADDRESS');
    }

    return {
      complete: missingFields.length === 0,
      missingFields,
      emailVerified: user.emailVerifiedAt !== null,
      requiredFields: [
        'FIRST_NAME',
        'LAST_NAME',
        'MOBILE_NUMBER',
        'WITHDRAWAL_ADDRESS',
      ],
      withdrawal: {
        asset: WITHDRAWAL_ASSET,
        networkCode: WITHDRAWAL_NETWORK_CODE,
        networkDisplayName: WITHDRAWAL_NETWORK_DISPLAY,
        validationProfile: WITHDRAWAL_VALIDATION_PROFILE,
        address: withdrawal?.destinationAddress ?? null,
        savedAt: withdrawal?.savedAt ?? null,
        lockedUntil: withdrawal?.lockedUntil ?? null,
        canChange:
          withdrawal === null || withdrawal.lockedUntil.getTime() <= Date.now(),
        lockDays: WITHDRAWAL_LOCK_DAYS,
      },
    };
  }
}
