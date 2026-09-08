import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const INTERNAL_TRADING_STATE_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'BLOCKED',
] as const;

export type InternalTradingStateStatus =
  (typeof INTERNAL_TRADING_STATE_STATUSES)[number];

export class InternalTradingPageQueryDto {
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

export class AdminInternalTradingStateQueryDto extends InternalTradingPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(INTERNAL_TRADING_STATE_STATUSES)
  status?: InternalTradingStateStatus;
}
