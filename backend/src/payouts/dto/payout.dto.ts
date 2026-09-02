import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PAYOUT_BUCKETS,
  PAYOUT_STATUSES,
  PAYOUT_VALIDATION_PROFILES,
  type PayoutBucket,
  type PayoutStatus,
  type PayoutValidationProfile,
} from '../payouts.constants';

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const PERCENT_PATTERN =
  /^(?:100(?:\.0{1,6})?|(?:\d|[1-9]\d)(?:\.\d{1,6})?)$/;

export class CreatePayoutDto {
  @IsUUID()
  requestKey!: string;

  @IsIn(PAYOUT_BUCKETS)
  sourceBucket!: PayoutBucket;

  @IsString()
  @Matches(MONEY_PATTERN)
  amount!: string;

  @IsString()
  @MaxLength(191)
  destinationAddress!: string;
}

export class PayoutPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminPayoutQueryDto extends PayoutPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(PAYOUT_STATUSES)
  status?: PayoutStatus;
}

export class PayoutReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class SubmitPayoutTxidDto {
  @IsString()
  @MaxLength(191)
  txid!: string;
}

export class UpdatePayoutPolicyDraftDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsBoolean()
  requestsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  asset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  networkCode?: string;

  @IsOptional()
  @IsIn(PAYOUT_VALIDATION_PROFILES)
  validationProfile?: PayoutValidationProfile;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  minimumAmount?: string | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  maximumAmount?: string | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN)
  fixedFeeAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENT_PATTERN)
  percentageFee?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PAYOUT_BUCKETS, { each: true })
  enabledBuckets?: PayoutBucket[];
}

export class PublishPayoutPolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
