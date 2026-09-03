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
import {
  DEPOSIT_STATUSES,
  DEPOSIT_VALIDATION_PROFILES,
  type DepositStatus,
  type DepositValidationProfile,
} from '../deposits.constants';

const QR_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const ASSET_PATTERN = /^[A-Z0-9]{2,10}$/;
const NETWORK_CODE_PATTERN = /^[A-Z0-9_-]{2,40}$/;
const INVESTMENT_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/;

const normalizeUppercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

const normalizeTxid = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDepositPaymentRailDto {
  @Transform(normalizeUppercase)
  @IsString()
  @Matches(ASSET_PATTERN)
  asset!: string;

  @Transform(normalizeUppercase)
  @IsString()
  @Matches(NETWORK_CODE_PATTERN)
  networkCode!: string;

  @Transform(trimString)
  @IsString()
  @Length(2, 100)
  displayName!: string;

  @Transform(normalizeUppercase)
  @IsIn(DEPOSIT_VALIDATION_PROFILES)
  validationProfile!: DepositValidationProfile;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateDepositPaymentRailDto {
  @IsInt()
  @Min(1)
  expectedRevision!: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(2, 100)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class DepositPaymentRailQueryDto {
  @IsOptional()
  @Transform(normalizeUppercase)
  @IsString()
  @Matches(ASSET_PATTERN)
  asset?: string;
}

export class CreateDepositAccountDto {
  @Transform(trimString)
  @IsString()
  @Length(2, 100)
  label!: string;

  @Transform(trimString)
  @IsUUID()
  paymentRailId!: string;

  @Transform(trimString)
  @IsString()
  @Length(20, 100)
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

  @Transform(trimString)
  @IsString()
  @IsUUID()
  paymentRailId!: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(INVESTMENT_AMOUNT_PATTERN)
  investmentAmount?: string;
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
