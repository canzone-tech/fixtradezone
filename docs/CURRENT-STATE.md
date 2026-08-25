# FixTradeZone — Current State

## Latest Verified Mainline Checkpoint — 2026-08-25

MLM-01 Referral Foundation is complete, merged into `main`, and reverified locally from the merged mainline.

### Mainline
- PR #15: `feat(referrals): deliver MLM-01 referral foundation` — MERGED.
- Main merge commit: `2a06487b23d2c9cb0bc2078e93bde6eba220c42d`.
- Local `main` was fast-forwarded to `prashant/main` after merge.
- Local mainline milestone verification: GREEN.

### Local mainline verification
`npm run verify:milestone` passed after the PR merge:
- Prisma schema validation: GREEN;
- backend Prettier check: GREEN;
- backend ESLint: GREEN;
- backend Jest: 24/24 suites, 129/129 tests;
- NestJS production build: GREEN;
- backend diff checks: GREEN;
- Prisma migration status: 6 migrations, schema up to date;
- admin ESLint: GREEN;
- admin TypeScript `tsc --noEmit`: GREEN;
- Next.js 16.3.1 production build: GREEN;
- root diff checks: GREEN.

## MLM-01 Referral Foundation — COMPLETE

### Backend / database
Implemented and accepted:
- referral profiles and sponsor relationships;
- sponsor-change history;
- singleton referral system configuration;
- migration `0006_referral_foundation`;
- registration-time referral attribution;
- configured root/default sponsor behavior;
- self-sponsor and referral-cycle protection;
- audited sponsor assignment/reassignment;
- delegated ADMIN sponsor changes behind explicit permission and system switch;
- direct-referral query API.

USER API:
- `GET /referrals/me`
- `GET /referrals/me/direct?page=1&limit=20`

ADMIN/SUPER_ADMIN API:
- `GET /admin/referrals/config`
- `PATCH /admin/referrals/config`
- `PATCH /admin/referrals/:userId/sponsor`

Registration accepts optional `referralCode`.

Existing-user migration mode remains `LEAVE_UNASSIGNED_FOR_REVIEW`; historical sponsor relationships are never guessed.

### Frontend / BFF
USER:
- `/user/referrals` live referral workspace;
- live sponsor and assignment status;
- live direct-referral list;
- shareable `register?ref=<REFERRAL_CODE>` invite links;
- `/user/dashboard` live referral assignment state and direct-referral count.

ADMIN/SUPER_ADMIN:
- `/referrals` management workspace;
- referral enrollment/default sponsor configuration;
- delegated ADMIN sponsor-change switch;
- audited sponsor assignment/reassignment controls;
- permission-aware navigation.

Browser authentication remains same-origin BFF + HttpOnly/SameSite cookies. Session validation/refresh precedes dependent referral data calls to avoid rotating-refresh-token races.

### Integrated acceptance
The accepted browser/API flow proved:
1. SUPER_ADMIN loaded and saved live referral configuration.
2. Fresh USER A registered, was activated, logged in, and was assigned under the configured founder/root default sponsor.
3. USER A copied the generated referral invite link.
4. Fresh USER B registered through USER A's invite link.
5. USER B was activated and showed USER A as sponsor.
6. USER A's direct-referral UI/readback showed USER B as `ACTIVE / ASSIGNED` and the direct total increased.

This validates frontend -> Next.js BFF -> Nest API -> MySQL -> frontend readback.

## Active Development Slice

New branch from verified `main`:
- `feature/packages-foundation`

Next slice: **Packages / Plan Foundation**.

Reason for sequence: package state/config is a dependency for matching, reward generation, upgrade/renewal behavior, caps, deposit-triggered activation, and later ledger calculations. Commission/reward engines must not be implemented before package semantics and lifecycle are explicit.

## Packages / Plan Foundation — Planning Gate

Work should lock the exact contract before Codex implements dependent schema or APIs. At minimum the package slice must define:
- package catalog/config and versioning;
- package price and currency representation;
- configured reward-rate range/rule representation;
- configured return/cap multiplier semantics;
- duration/cycle fields;
- package status/availability;
- user-package lifecycle states;
- activation source/timing;
- renewal and upgrade behavior;
- single-active vs multiple-active package mode interaction;
- historical configuration/version preservation;
- SUPER_ADMIN vs delegated ADMIN management boundaries;
- audit requirements;
- what is intentionally deferred to Deposit, Wallet/Ledger, Commission/Matching and Simulated Activity modules.

Do not create mutable financial balances or earnings in the Packages slice. Financial effects must later flow through the approved ledger/idempotency/reversal architecture.

## Locked Delivery Workflow
1. Work locks business semantics and implementation contract.
2. Codex/engineering implements one focused vertical slice on the feature branch.
3. Backend/API may use Postman as an intermediate checkpoint.
4. Matching frontend/BFF/UI is implemented in the same slice.
5. Run `npm run verify:local`.
6. Apply DB migrations explicitly when required and run `npm run verify:milestone`.
7. Final module acceptance is API + frontend together locally.
8. Update persistent docs.
9. Open PR only after all gates are green.

Local verification remains the acceptance authority even when Work/Codex/CI reports success.

## Core Architecture / Security
- Backend: NestJS + TypeScript.
- ORM: Prisma 7.9.1 with MariaDB adapter.
- Relational source of truth: MySQL.
- MongoDB reserved for document/config/CMS use where appropriate.
- Redis for transient/cache/session-adjacent infrastructure.
- Frontend/admin/user portal: Next.js.
- JWT access + rotating refresh sessions.
- Browser auth boundary: same-origin BFF + HttpOnly/SameSite cookies.
- RBAC roles: `SUPER_ADMIN`, `ADMIN`, `USER`.
- Backend remains authentication/authorization authority.
- Financial modules must use SQL `DECIMAL`, idempotency, immutable/auditable ledger entries, reversals and explicit authorization.
- Simulated activity must always be explicitly labelled simulated and never presented as real trading/profits.

## Continuity
GitHub repository + committed `docs/` are the permanent source of truth.

Work and Codex are acceleration layers. If they are unavailable or limits are reached, resume in normal Chat from:
1. current Git branch/commit;
2. this file;
3. `docs/WORK-CODEX-OPERATING-BRIEF.md`;
4. relevant business-rule / architecture documents.

## Immediate Next Action
Open the FixTradeZone workspace in Work and use `docs/WORK-CODEX-OPERATING-BRIEF.md` plus the repository docs to lock the Packages / Plan Foundation contract before Codex implementation begins.
