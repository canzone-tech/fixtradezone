import { IsIn } from 'class-validator';

export const MANAGEABLE_USER_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'BLOCKED',
] as const;

export type ManageableUserStatus = (typeof MANAGEABLE_USER_STATUSES)[number];

export class UpdateUserStatusDto {
  @IsIn(MANAGEABLE_USER_STATUSES)
  status!: ManageableUserStatus;
}
