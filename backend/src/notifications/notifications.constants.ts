export const NOTIFICATION_CATEGORIES = [
  'GENERAL',
  'SYSTEM',
  'FINANCE',
  'SECURITY',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_AUDIENCES = ['USER', 'ALL_USERS'] as const;

export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_AUDIT_OPERATION = 'ADMIN_NOTIFICATION_CREATE';
