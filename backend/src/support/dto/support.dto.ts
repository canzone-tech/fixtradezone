import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SUPPORT_TICKET_STATUSES,
  type SupportTicketStatus,
} from '../support.constants';

export class SupportPageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CreateSupportTicketDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(160)
  subject!: string;

  @IsString()
  @MaxLength(4000)
  message!: string;
}

export class SupportReplyDto {
  @IsString()
  @MaxLength(4000)
  message!: string;
}

export class AdminSupportTicketQueryDto extends SupportPageQueryDto {
  @IsOptional()
  @IsIn(SUPPORT_TICKET_STATUSES)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class AssignSupportTicketDto {
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;
}

export class ChangeSupportTicketStatusDto {
  @IsIn(SUPPORT_TICKET_STATUSES)
  status!: SupportTicketStatus;
}

export class InternalSupportNoteDto {
  @IsString()
  @MaxLength(4000)
  message!: string;
}

export class CreateSupportCategoryDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,59}$/)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateSupportCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}