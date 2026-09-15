import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { trimString } from '../../auth/dto/string.transformers';

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const normalizeAddress = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ConfigureDepositBlockchainVerificationDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(4_294_967_295)
  chainId!: number;

  @Transform(normalizeAddress)
  @IsString()
  @Matches(EVM_ADDRESS_PATTERN)
  tokenContractAddress!: string;

  @IsInt()
  @Min(0)
  @Max(36)
  tokenDecimals!: number;

  @IsInt()
  @Min(1)
  @Max(100)
  requiredConfirmations!: number;

  @Transform(trimString)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
