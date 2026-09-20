import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-user';
import type { RequestContext } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { CreatePayoutDto } from './dto/payout.dto';
import { PayoutAccountingService } from './payout-accounting.service';
import { PayoutPolicyService } from './payout-policy.service';
import { PayoutsService } from './payouts.service';

interface WithdrawalProfileRow {
  destinationAddress: string;
  asset: string;
  networkCode: string;
  validationProfile: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

/**
 * USER payout requests are bound to the withdrawal address saved in Personal
 * Details. The request still stores an immutable address snapshot, while the
 * client is prevented from substituting a different destination per payout.
 */
@Injectable()
export class ProfileBoundPayoutsService extends PayoutsService {
  constructor(
    private readonly profilePrisma: PrismaService,
    payoutPolicy: PayoutPolicyService,
    payoutAccounting: PayoutAccountingService,
  ) {
    super(profilePrisma, payoutPolicy, payoutAccounting);
  }

  override async createRequest(
    dto: CreatePayoutDto,
    actor: AuthenticatedUser,
    context: RequestContext = {},
  ) {
    const rows = await this.profilePrisma.$queryRaw<WithdrawalProfileRow[]>(
      Prisma.sql`
        SELECT
          p.destinationAddress,
          p.asset,
          p.networkCode,
          p.validationProfile,
          u.firstName,
          u.lastName,
          u.phone
        FROM user_withdrawal_profiles p
        INNER JOIN users u ON u.id = p.userId
        WHERE p.userId = ${actor.id}
        LIMIT 1
      `,
    );
    const profile = rows[0];

    if (
      !profile ||
      !profile.firstName?.trim() ||
      !profile.lastName?.trim() ||
      !profile.phone?.trim()
    ) {
      throw new ConflictException(
        'Complete your profile and save a USDT BEP-20 withdrawal address before requesting a withdrawal.',
      );
    }

    if (
      profile.asset !== 'USDT' ||
      profile.networkCode !== 'BEP20' ||
      profile.validationProfile !== 'EVM'
    ) {
      throw new ServiceUnavailableException(
        'Saved withdrawal profile network configuration is invalid.',
      );
    }

    const submittedAddress = dto.destinationAddress.trim();
    if (submittedAddress !== profile.destinationAddress) {
      throw new ConflictException(
        'Withdrawal destination must match the address saved in Personal Details.',
      );
    }

    return super.createRequest(
      {
        ...dto,
        destinationAddress: profile.destinationAddress,
      },
      actor,
      context,
    );
  }
}
