# FixTradeZone — Architecture Decision Log

## ADR-001 — MySQL is the primary relational source of truth
LOCKED. MySQL owns relational/business/accounting data.

## ADR-002 — MongoDB is for flexible document/configuration data
LOCKED. MongoDB owns flexible CMS/template/configuration documents.

## ADR-003 — Redis is cache/queue/temporary state
LOCKED.

## ADR-004 — Single application database
LOCKED. The only real FixTradeZone application database is `fixtradezone` on the existing host MySQL server.

## ADR-005 — Avoid Prisma migrate dev without explicit shadow DB approval
LOCKED. `migrate dev` requires a shadow DB; use a single-database baseline/apply strategy.

## ADR-006 — JWT deny-by-default
LOCKED. All protected/business APIs require JWT. Only explicitly public endpoints are exempt.

## ADR-007 — Health is public
LOCKED. `/health` is public for monitoring.

## ADR-008 — Simulated activity must be labeled
LOCKED. Simulated trades/results are always clearly labeled and never represented as real trading.

## ADR-009 — Deposit account is server-assigned
LOCKED. Backend randomly assigns one active USDT TRC20 account per deposit.

## ADR-010 — Manual TXID approval
LOCKED. User submits TXID; authorized admin manually verifies and approves/rejects. No automatic credit on submission.

## ADR-011 — Production-ready standard
LOCKED. Security, architecture, integrity, scalability, maintainability and auditability are not traded away for speed.

## ADR-012 — Template-based frontend/admin
LOCKED. Public landing page and admin UI use reusable templates/components and configuration rather than one-off hardcoded layouts.

## ADR-013 — Local-first delivery gate
LOCKED. Feature work is completed on a local feature branch. Relevant automated checks and Postman/manual API verification must pass before a pull request is opened against `main`. Pull requests require green CI and review before merge.

## ADR-014 — API and admin vertical slices ship together
LOCKED. After the authentication foundation, each module is delivered as a focused vertical slice: database/API contract, NestJS implementation and tests, Postman verification, minimal Next.js admin screen, integration states, automated checks, founder approval, then pull request.

## ADR-015 — Fast v1 scope
LOCKED. V1 contains only launch-critical workflows. A fully configurable CMS, broad reporting, decorative dashboards, and nonessential customization move to v2. Security, validation, RBAC, auditability, ledger integrity, idempotency, duplicate-TXID prevention, and manual financial approvals are never deferred.

## ADR-016 — Admin session boundary
LOCKED. The admin browser authenticates through same-origin Next.js route handlers. Access and refresh tokens are stored in Secure/HttpOnly/SameSite cookies and are not exposed to client-side JavaScript. NestJS remains the authentication and authorization source of truth.

## ADR-017 — Single Dark Neo admin design system
LOCKED. All FixTradeZone admin and protected user/backend pages use the single FixTradeZone Dark Neo design system and shared master theme. The approved dashboard/global shell is not redesigned globally; visual changes are limited to the specific module being developed unless explicitly approved otherwise.

## ADR-018 — Universal responsive backend contract
LOCKED. Protected pages must remain within the viewport on mobile. Forms stack responsively, cards cannot force viewport overflow, and wide tables/matrices use internal horizontal scrolling instead of shrinking the entire page.

## ADR-019 — Permission-aware administrator navigation
LOCKED. Sidebar visibility follows authenticated RBAC permissions. SUPER_ADMIN retains full platform navigation authority. ADMIN users see only implemented modules for which their effective permission scope grants access. Hiding navigation is a UX rule only; NestJS permission guards remain the authoritative security boundary.

## ADR-020 — Shared protected application shell contract
LOCKED. Every protected application page has a sidebar and topbar unless the Founder explicitly approves an exception. Administrator pages use AdminShell/Startbar/Topbar. USER pages use the USER shell while reusing the same approved FixTradeZone Dark Neo master sidebar/topbar visual system.

## ADR-021 — User impersonation is an isolated authentication boundary
LOCKED. Impersonation uses a dedicated session/token boundary retaining both the original administrator actor and selected USER identity. Impersonation tokens cannot authenticate against administrator APIs, and administrator authority never transfers into the selected USER authorization context.

## ADR-022 — FULL/LIMITED impersonation is evaluated live
LOCKED. SUPER_ADMIN controls the global Full Impersonation setting. LIMITED is the safe support boundary. FULL permits only implemented USER-side capabilities of the selected USER and never ADMIN/SUPER_ADMIN authority. Existing impersonation sessions use the current server configuration without token reissue.

## ADR-023 — Idle lock preserves authenticated application state
LOCKED. Idle timeout locks the UI without logout or navigation. Password reauthentication unlocks the same page and state. During impersonation, reauthentication uses the original ADMIN/SUPER_ADMIN actor password rather than the selected USER password.

## ADR-024 — Security configuration is SUPER_ADMIN-only
LOCKED. Privileged security configuration is stored as a validated and audited singleton. Full Impersonation and idle-lock duration are configurable only by SUPER_ADMIN. Idle duration defaults to 5 minutes and is constrained to 1–120 minutes.
