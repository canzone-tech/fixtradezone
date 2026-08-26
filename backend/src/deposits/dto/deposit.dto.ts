import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';
import { IsValidTronAddress } from '../deposit.validation';
import { DEPOSIT_STATUSES, type DepositStatus } from '../deposits.constants';

const TXID_PATTERN = /^[0-9a-f]{64}$/;
const QR_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

const normalizeTxid = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateDepositAccountDto {
  @Transform(trimString)
  @IsString()
  @Length(2, 100)
  label!: string;

  @Transform(trimString)
  @IsString()
  @IsValidTronAddress()
  walletAddress!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(360_000)
  @Matches(QR_DATA_URL_PATTERN, {
    message: 'qrCodeDataUrl must be a supported base64 image data URL.',
  })
  qrCodeDataUrl!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateDepositAccountDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(2, 100)
  label?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(360_000)
  @Matches(QR_DATA_URL_PATTERN, {
    message: 'qrCodeDataUrl must be a supported base64 image data URL.',
  })
  qrCodeDataUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class CreateDepositDto {
  @Transform(trimString)
  @IsString()
  @IsUUID()
  packagePlanItemId!: string;
}

export class SubmitDepositTxidDto {
  @Transform(normalizeTxid)
  @IsString()
  @Matches(TXID_PATTERN, {
    message: 'txid must be exactly 64 hexadecimal characters.',
  })
  txid!: string;
}

export class ReviewDepositDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 1000)
  note!: string;
}

export class AdminDepositQueryDto {
  @IsOptional()
  @IsIn(DEPOSIT_STATUSES)
  status?: DepositStatus;

  @IsOptional()
  @Transform(trimString)
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
