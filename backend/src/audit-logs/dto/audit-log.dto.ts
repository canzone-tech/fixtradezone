import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'APPROVE',
  'REJECT',
  'SUSPEND',
  'ACTIVATE',
  'BLOCK',
  'UNBLOCK',
  'PASSWORD_CHANGE',
  'ROLE_CHANGE',
  'PERMISSION_CHANGE',
  'IMPERSONATION_START',
  'IMPERSONATION_STOP',
] as const;

export type AuditActionValue = (typeof AUDIT_ACTIONS)[number];

export class AuditLogQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: AuditActionValue;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  search?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
