import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export class SubscriptionPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}

export class AdminSubscriptionQueryDto extends SubscriptionPageQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class PurchasePackageFromTotalWalletDto {
  @IsUUID()
  requestKey!: string;

  @IsUUID()
  packagePlanItemId!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  amount!: string;
}
