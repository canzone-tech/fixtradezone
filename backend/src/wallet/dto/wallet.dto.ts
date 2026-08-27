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
