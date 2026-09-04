import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CATEGORIES,
  type NotificationAudience,
  type NotificationCategory,
} from '../notifications.constants';

function optionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export class NotificationPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  unreadOnly?: boolean;
}

export class AdminNotificationQueryDto extends NotificationPageQueryDto {
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category?: NotificationCategory;
}

export class CreateAdminNotificationDto {
  @IsIn(NOTIFICATION_AUDIENCES)
  audience!: NotificationAudience;

  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_CATEGORIES)
  category: NotificationCategory = 'GENERAL';

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}
