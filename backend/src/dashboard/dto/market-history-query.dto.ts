import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  MARKET_INTERVALS,
  MARKET_SYMBOLS,
  type MarketInterval,
  type MarketSymbol,
} from '../dashboard.constants';

export class MarketHistoryQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim().toUpperCase()
      : value,
  )
  @IsIn(MARKET_SYMBOLS)
  symbol!: MarketSymbol;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.trim()
      : value,
  )
  @IsOptional()
  @IsIn(MARKET_INTERVALS)
  interval: MarketInterval = '1h';

  @Transform(({ value }) =>
    typeof value === 'string'
      ? Number(value)
      : value,
  )
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  limit = 48;
}
