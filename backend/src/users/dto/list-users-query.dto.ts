import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING'] as const;

export type UserStatusFilter = (typeof USER_STATUSES)[number];

export class ListUsersQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatusFilter;

  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? 1 : Number(value),
  )
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? 20 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
