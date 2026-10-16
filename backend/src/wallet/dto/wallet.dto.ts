import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class WalletPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 7, 30])
  days?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fromDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  toDate?: string;
}

export class AdminWalletQueryDto extends WalletPageQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/)
  currency?: string;
}

export class AdminLedgerQueryDto extends WalletPageQueryDto {
  @IsOptional()
  @IsUUID()
  postedByUserId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{2,10}$/)
  currency?: string;
}
