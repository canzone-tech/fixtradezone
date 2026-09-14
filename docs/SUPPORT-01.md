# SUPPORT-01 — Support Ticketing System

Status: implementation branch `feature/support-ticketing-system`

## Boundary

SUPPORT-01 provides a MySQL-authoritative support ticket workflow for protected FixTradeZone users and authorized administration staff. Ticket state and history are authoritative in MySQL. In-app notifications and email are secondary notification transports only.

Attachments, live chat, campaigns/offers, SLA automation, AI support bots, and a knowledge base are intentionally outside SUPPORT-01.

## Data model

Forward migration: `0042_support_ticketing_system`.

- `support_ticket_categories` — configurable active/inactive ticket categories.
- `support_tickets` — current ticket state, owner, category snapshot, assignment, and lifecycle timestamps.
- `support_ticket_entries` — append-only conversation/history entries for USER replies, staff replies, internal notes, status changes, and assignment changes.

The migration also adds the `SUPPORT` in-app notification category and SUPPORT-01 RBAC permissions. Existing migrations are not rewritten.

## Lifecycle

`OPEN → IN_PROGRESS → WAITING_FOR_USER → RESOLVED → CLOSED`

Operationally permitted transitions are:

- `OPEN` → `IN_PROGRESS` or `RESOLVED`
- `IN_PROGRESS` → `WAITING_FOR_USER` or `RESOLVED`
- `WAITING_FOR_USER` → `IN_PROGRESS` or `RESOLVED`
- `RESOLVED` → `IN_PROGRESS` or `CLOSED`
- `CLOSED` is terminal

A USER reply while `WAITING_FOR_USER` returns the ticket to `IN_PROGRESS`. USER replies are rejected after `RESOLVED` or `CLOSED`.

## Ownership and RBAC

USER endpoints always scope ticket reads and replies to the authenticated owner. Internal notes and assignment history are not exposed in USER ticket responses. Staff identity is reduced to a generic Support label in USER-visible history.

Administration permissions:

- `support.tickets.read`
- `support.tickets.reply`
- `support.tickets.assign`
- `support.tickets.status.manage`
- `support.tickets.notes.manage`
- `support.categories.manage`

SUPER_ADMIN retains the existing platform permission bypass. SUPPORT-01 does not introduce a hard-coded SUPPORT role; support staff access is composed through existing RBAC.

## API surface

USER:

- `GET /support/categories`
- `GET /support/tickets`
- `POST /support/tickets`
- `GET /support/tickets/:ticketId`
- `POST /support/tickets/:ticketId/replies`

ADMIN / SUPER_ADMIN:

- `GET /admin/support/categories`
- `POST /admin/support/categories`
- `PATCH /admin/support/categories/:categoryId`
- `GET /admin/support/assignees`
- `GET /admin/support/tickets`
- `GET /admin/support/tickets/:ticketId`
- `POST /admin/support/tickets/:ticketId/replies`
- `PATCH /admin/support/tickets/:ticketId/assignment`
- `PATCH /admin/support/tickets/:ticketId/status`
- `POST /admin/support/tickets/:ticketId/notes`

## Notifications and email

Support ticket creation, staff replies, and staff-driven status changes create USER in-app notifications with `sourceType=SUPPORT_TICKET` and `sourceId=<ticket UUID>`.

Transactional managed email keys:

- `SUPPORT_TICKET_CREATED`
- `SUPPORT_TICKET_REPLY`
- `SUPPORT_TICKET_STATUS_CHANGED`

These use the existing managed template and email delivery engine. SMTP/Titan logic is not duplicated. Notification/email errors are caught after authoritative ticket persistence and cannot roll back ticket state.

`MARKETING_OFFER` remains outside SUPPORT-01 and is not part of the support workflow.

## Protected UI

- USER workspace: `/user/support`
- ADMIN/SUPER_ADMIN queue: `/support`

Both use the existing protected FixTradeZone shell and universal navy/cyan design authority. Backend RBAC remains authoritative even when the UI hides controls the current administrator cannot use.

## Acceptance gate

After CI is GREEN and the branch is pulled locally:

1. Apply migrations only with `npx prisma migrate deploy` and confirm `npx prisma migrate status`.
2. Browser-first USER acceptance: create, own-list, detail/history, reply, resolved/closed read-only, responsive/mobile.
3. Browser-first ADMIN acceptance: queue/filter, detail, reply, assign, status, internal note, category oversight according to permissions.
4. Targeted local Postman/API checks for ownership isolation, RBAC denials, lifecycle rejection, and internal-note privacy.
5. Targeted MySQL readback for ticket owner/state, append-only entries, notification source references, and audit records.
6. PR to `main` only after all local acceptance gates are GREEN.
