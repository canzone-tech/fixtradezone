export const SUPPORT_TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
  'RESOLVED',
  'CLOSED',
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_ENTRY_TYPES = [
  'USER_REPLY',
  'STAFF_REPLY',
  'INTERNAL_NOTE',
  'STATUS_CHANGE',
  'ASSIGNMENT_CHANGE',
] as const;

export type SupportEntryType = (typeof SUPPORT_ENTRY_TYPES)[number];

export const SUPPORT_STATUS_TRANSITIONS: Record<
  SupportTicketStatus,
  readonly SupportTicketStatus[]
> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_FOR_USER', 'RESOLVED'],
  WAITING_FOR_USER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

export function canTransitionSupportStatus(
  current: SupportTicketStatus,
  next: SupportTicketStatus,
): boolean {
  return SUPPORT_STATUS_TRANSITIONS[current].includes(next);
}

export const USER_REPLYABLE_SUPPORT_STATUSES: readonly SupportTicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_USER',
];