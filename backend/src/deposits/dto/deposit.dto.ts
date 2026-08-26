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
import { IsValidDepositAddress } from '../deposit.validation';
import {
  DEFAULT_DEPOSIT_ASSET,
  DEFAULT_DEPOSIT_NETWORK,
  DEPOSIT_NETWORKS,
  DEPOSIT_STATUSES,
  type DepositNetwork,
  type DepositStatus,
} from '../deposits.constants';

const QR_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const ASSET_PATTERN = /^[A-Z0-9]{2,10}$/;

const normalizeUppercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const normalizeTxid = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDepositAccountDto {
  @Transform(trimString)
  @IsString()
  @Length(2, 100)
  label!: string;

  @IsOptional()
  @Transform(normalizeUppercase)
  @IsString()
  @Matches(ASSET_PATTERN, {
    message: 'asset must contain 2 to 10 uppercase letters or digits.',
  })
  asset: string = DEFAULT_DEPOSIT_ASSET;

  @IsOptional()
  @Transform(normalizeUppercase)
  @IsIn(DEPOSIT_NETWORKS)
  network: DepositNetwork = DEFAULT_DEPOSIT_NETWORK;

  @Transform(trimString)
  @IsString()
  @IsValidDepositAddress()
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
  @Length(1, 191)
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
