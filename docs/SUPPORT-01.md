# SUPPORT-01 — Support Ticketing System

Status: implementation branch `feature/support-ticketing-system`

## Boundary

SUPPORT-01 provides a MySQL-authoritative support ticket workflow for protected FixTradeZone users and authorized administration staff. Ticket state, history, and attachment metadata are authoritative in MySQL. Attachment file bytes are stored in a backend-controlled non-public directory. In-app notifications and email are secondary notification transports only.

Optional ticket attachments are included. Live chat, campaigns/offers, SLA automation, AI support bots, and a knowledge base remain outside SUPPORT-01.

## Data model

Forward migrations:

- `0042_support_ticketing_system`
- `0043_support_ticket_attachments`

Tables:

- `support_ticket_categories` — configurable active/inactive ticket categories.
- `support_tickets` — current ticket state, owner, category snapshot, assignment, and lifecycle timestamps.
- `support_ticket_entries` — append-only conversation/history entries for USER replies, staff replies, internal notes, status changes, and assignment changes.
- `support_ticket_attachments` — immutable attachment metadata including ticket, uploader, original filename, storage key, MIME type, size, SHA-256 digest, and creation time.

Migration `0042` also adds the `SUPPORT` in-app notification category and SUPPORT-01 RBAC permissions. Applied migrations are not rewritten; attachment support is introduced only through forward migration `0043`.

## Optional attachment policy

Attachments are optional. A ticket or reply with zero attachments remains fully valid and continues to use the existing JSON ticket/reply APIs.

When supplied:

- up to 3 files per upload
- maximum 5 MB per file
- JPG/JPEG, PNG, or PDF only
- server verifies the file signature and filename extension instead of trusting the browser MIME type alone
- stored filenames are opaque UUID-based names
- original filename, MIME type, byte size, uploader, SHA-256, ticket ID, storage key, and creation time are persisted in MySQL
- USER access is owner-scoped; staff access uses the existing support RBAC permissions
- download is authenticated and never exposes the storage directory as a public/static URL
- resolved/closed tickets are read-only and reject new attachments

Local development defaults to `storage/support-attachments` relative to the backend process working directory. `SUPPORT_ATTACHMENT_STORAGE_DIR` can override this. Production should set it to a persistent non-public directory outside the release checkout, for example `/var/lib/fixtradezone/support-attachments`.

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

USER endpoints always scope ticket reads, replies, attachment lists, attachment uploads, and attachment downloads to the authenticated owner. Internal notes and assignment history are not exposed in USER ticket responses. Staff identity is reduced to a generic Support label in USER-visible history and attachment metadata.

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
- `GET /support/tickets/:ticketId/attachments`
- `POST /support/tickets/:ticketId/attachments`
- `GET /support/tickets/:ticketId/attachments/:attachmentId`

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
- `GET /admin/support/tickets/:ticketId/attachments`
- `POST /admin/support/tickets/:ticketId/attachments`
- `GET /admin/support/tickets/:ticketId/attachments/:attachmentId`

Admin attachment list/download requires `support.tickets.read`; upload requires `support.tickets.reply`.

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

Both use the existing protected FixTradeZone shell and universal navy/cyan design authority. Backend ownership/RBAC remains authoritative even when the UI hides controls the current administrator cannot use.

The USER ticket-creation form and USER/staff reply forms expose optional attachment selectors. Existing text-only ticket and reply workflows remain unchanged when no files are selected.

## Acceptance gate

After CI is GREEN and the branch is pulled locally:

1. Apply migrations only with `npx prisma migrate deploy` and confirm `npx prisma migrate status`.
2. Browser-first USER acceptance: create with zero attachments, create with a valid attachment, own-list, detail/history, authenticated download, reply with/without attachment, resolved/closed read-only, responsive/mobile.
3. Browser-first ADMIN acceptance: queue/filter, detail, attachment list/download, staff reply with/without attachment, assign, status, internal note, category oversight according to permissions.
4. Targeted local Postman/API checks for ownership isolation, RBAC denials, lifecycle rejection, optional zero-file behavior, invalid type/oversize rejection, and attachment download authorization.
5. Targeted MySQL readback for ticket owner/state, append-only entries, attachment metadata/hash, notification source references, and audit records.
6. PR to `main` only after all local acceptance gates are GREEN.
