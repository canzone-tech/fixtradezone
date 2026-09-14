export type SupportTicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_USER"
  | "RESOLVED"
  | "CLOSED";

export type SupportEntryType =
  | "USER_REPLY"
  | "STAFF_REPLY"
  | "INTERNAL_NOTE"
  | "STATUS_CHANGE"
  | "ASSIGNMENT_CHANGE";

export interface SupportCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportUserSummary {
  id: string;
  username: string | null;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  subject: string;
  status: SupportTicketStatus;
  assignedToUserId: string | null;
  assignedTo: SupportUserSummary | null;
  user: SupportUserSummary;
  lastActivityAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportEntry {
  id: string;
  ticketId: string;
  type: SupportEntryType;
  authorUserId: string | null;
  author: SupportUserSummary | null;
  body: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  entries: SupportEntry[];
}

export interface SupportAssignee {
  id: string;
  username: string;
  email: string | null;
}

export const SUPPORT_STATUSES: SupportTicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
];

export const SUPPORT_STATUS_TRANSITIONS: Record<
  SupportTicketStatus,
  SupportTicketStatus[]
> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED"],
  WAITING_FOR_USER: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

export function formatSupportStatus(status: SupportTicketStatus): string {
  return status.replaceAll("_", " ");
}

export function supportStatusTone(
  status: SupportTicketStatus,
): "success" | "warning" | undefined {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "WAITING_FOR_USER") return "warning";
  return undefined;
}
