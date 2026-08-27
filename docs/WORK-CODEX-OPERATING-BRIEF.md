# FixTradeZone Work / Codex Operating Brief

## Purpose

This is the canonical handoff brief for continuing FixTradeZone through ChatGPT Work, Codex, or normal Chat without losing architecture, delivery discipline, or repository continuity.

GitHub repository + committed `docs/` are the permanent source of truth. Work and Codex are acceleration layers, not sources of truth.

## Current checkpoint — 2026-08-25

- MLM-01 Referral Foundation: COMPLETE.
- PR #15 merged into `main`.
- Main merge commit: `2a06487b23d2c9cb0bc2078e93bde6eba220c42d`.
- Local merged-main `npm run verify:milestone`: GREEN.
- Backend: 24/24 suites, 129/129 tests GREEN.
- Prisma: 6 migrations, schema up to date GREEN.
- Admin/Next.js lint, typecheck and production build: GREEN.
- MLM-01 Postman API gate: GREEN.
- MLM-01 integrated browser + API gate: GREEN.
- Active next-slice branch: `feature/packages-foundation`.
- PKG-01 Q33–Q39 Option A and all initial safe defaults: FOUNDER APPROVED.
- Package contract commit: `79cd4a5`.
- PKG-01 backend/schema/static gate: GREEN in Work (26 suites / 148 tests).
- Local migration and milestone status: GREEN; seven migrations up to date.
- Package BFF/UI implementation and production build: GREEN in Work.
- Combined Postman/SQL/browser acceptance: PENDING.

## Accepted MLM-01 end-to-end proof

The locally accepted referral flow proved:

1. SUPER_ADMIN referral configuration loaded and saved through the UI.
2. Fresh USER A registered and was activated.
3. USER A showed `ASSIGNED` under the configured founder/root default sponsor.
4. USER A copied the generated `register?ref=<REFERRAL_CODE>` invite link.
5. Fresh USER B registered through USER A's invite link.
6. USER B was activated and showed USER A as sponsor.
7. USER A's live direct-referral list showed USER B as `ACTIVE / ASSIGNED`.
8. USER A's live direct-referral total increased.

This validates frontend -> Next.js BFF -> Nest API -> MySQL -> frontend readback for MLM-01.

## Next slice — Packages / Plan Foundation

Packages comes before commissions/rewards because package state/config is required for matching bases, reward generation, caps, upgrades, renewals and deposit-triggered activation.

### Approved contract and active gate

The planning gate is complete. The implementation authority is
`docs/PACKAGES-PLAN-FOUNDATION.md`, backed by Q33–Q39 in
`docs/MLM-BUSINESS-RULES.md`.

The slice now contains migration `0007_package_plan_foundation`, the versioned
package-plan APIs, RBAC/audit/publication protections, focused tests, the
same-origin BFF, Dark Neo ADMIN/USER package interfaces and the ordered Postman
gate.

Do not invent or credit earnings in this slice. Financial effects belong to
later ledger-backed modules. The Founder explicitly authorized BFF/UI work while
manual package verification is batched into one final pass. Do not push/open a
PR or call PKG-01 accepted until Postman, SQL and browser checks are confirmed
under `docs/LOCAL-VERIFY-PACKAGES.md`.

## Relevant locked MLM/business rules

The persistent `docs/MLM-BUSINESS-RULES.md` remains authoritative. Important package-dependent rules already locked include:

- referral levels/rates configurable;
- matching base `MIN(receiver active package, downline package) * level %`;
- matching enablement configurable by level;
- matching triggers configurable for first/new/renewal/upgrade;
- upgrade matching treatment configurable as FULL or INCREMENTAL;
- active-package qualification behavior configurable;
- compression/pass-up configurable;
- package mode configurable as `SINGLE_ACTIVE` / `MULTIPLE_ACTIVE`;
- matching package basis configurable;
- refund/reversal behavior must preserve financial auditability;
- award/package eligibility configurable;
- upgrade team-volume treatment configurable independently;
- release timing and cap inclusion/action configurable;
- plan migration mode configurable;
- reward basis/rate/frequency/cycle/cap/start/day-counting rules configurable;
- activation can be submitted/approved/manual/rule driven, with approved activation currently the safer default for later payment integration;
- historical calculations must not be silently rewritten by later config changes.

If a new ambiguity blocks the Packages contract, continue the numbered business-question sequence before implementation rather than guessing.

## Poster/package defaults currently captured

Treat these as configured product defaults, not hardcoded immutable business logic:

- Neural Scout — $5 — 0.40–0.60% — 2X — max profit $5 — 90d
- Voyager — $25 — 0.50–0.70% — 2X — max profit $25 — 90d
- Navigator — $50 — 0.60–0.80% — 2X — max profit $50 — 90d
- Strategist — $100 — 0.70–0.90% — 2X — max profit $100 — 90d
- Quant Core — $500 — 0.80–1.00% — 3X — max profit $1000 — 90d
- Prime — $1000 — 0.90–1.20% — 3X — max profit $2000 — 90d
- Apex — $2000 — 1.00–1.50% — 3X — max profit $4000 — 90d
- Titan — $4000 — 1.10–1.80% — 4X — max profit $12000 — 150d
- Sovereign — $5000 — 1.20–2.00% — 4X — max profit $15000 — 150d

Captured trade-cycle defaults:

- $5–24: 10d
- $25–49: 15d
- $50–99: 20d
- $100–499: 25d
- $500–999: 30d
- $1000–1999: 60d
- $2000–3999: 90d
- $4000–4999: 120d
- $5000+: 150d

These defaults must be reconciled into a versioned package/rule configuration; do not hardcode calculations in controllers or UI.

## Locked delivery workflow

1. Confirm business semantics before dependent implementation.
2. Implement one focused production-ready vertical slice.
3. Backend/API checkpoint may be tested during development.
4. Implement the matching frontend/BFF/UI for the same slice.
5. Run local module/repository verification.
6. Apply database migrations explicitly when required, then run milestone status.
7. Final module acceptance is API + frontend together in one local integrated flow.
8. Update persistent docs.
9. Open PR only after all local gates are green.

Do not merge or open a PR merely because Codex/CI says green. Local verification remains the acceptance authority.

## Local verification commands

Repository root:

```bash
npm run verify:local
```

Database-backed milestone:

```bash
npm run verify:milestone
```

Database deploy is an explicit write operation, separate from verification.

## Branch discipline

- Feature branches only.
- Active next-slice branch: `feature/packages-foundation`.
- Child branches may be used for frontend/backend work inside the same vertical slice.
- Integrate child work back into the slice branch and reverify before PR preparation.
- No PR to `main` until local code gate + DB gate when applicable + integrated API/frontend acceptance are green.
- Keep meaningful checkpoints committed and pushed.

## Core architecture

- Backend: NestJS + TypeScript.
- ORM: Prisma 7.9.1 with MariaDB adapter.
- Relational source of truth: MySQL.
- MongoDB: document/config/CMS use only where appropriate.
- Redis: transient cache/queue/session-adjacent state only.
- Frontend/admin/user portal: Next.js.
- Browser authentication: same-origin BFF + HttpOnly/Secure/SameSite cookies; browser JavaScript must not own access/refresh tokens.
- Backend remains authentication/authorization authority.
- JWT access + rotating refresh sessions.
- RBAC with `SUPER_ADMIN`, `ADMIN`, `USER`.
- Health may be public; business/admin/user APIs remain protected.

## Security and financial invariants

- Production-ready by default.
- Never weaken validation, RBAC, auditability, data integrity, idempotency, maintainability, or financial safety for speed.
- Financial calculations use SQL `DECIMAL`, immutable/auditable ledger patterns, idempotency, reversal entries and explicit permissions.
- Do not model commissions/rewards by unsafe mutable balance increments.
- Plan/config versions must preserve historical calculations.
- `SUPER_ADMIN` is founder/master authority; `ADMIN` has delegated, explicit permissions only.
- Simulated activity must always be clearly labeled simulated; never present fake trades/profits as real.

## MLM-01 retained contract

USER:

- `GET /referrals/me`
- `GET /referrals/me/direct?page=1&limit=20`
- `/user/referrals`
- `/user/dashboard` live referral summary

ADMIN/SUPER_ADMIN:

- `GET /admin/referrals/config`
- `PATCH /admin/referrals/config`
- `PATCH /admin/referrals/:userId/sponsor`
- `/referrals`

Registration accepts optional `referralCode`; same-origin invite links use `register?ref=<REFERRAL_CODE>`.

Existing-user referral migration remains `LEAVE_UNASSIGNED_FOR_REVIEW`. Never guess historical sponsor relationships.

## Work / Codex responsibilities

Use Work for:

- resolving pending business questions;
- package/plan contract definition;
- module sequencing;
- architecture/security reviews;
- specifications and persistent docs.

Use Codex for:

- repository implementation after the contract is explicit;
- focused refactors;
- tests;
- lint/type/build fixes;
- safe parallel work on independent tasks.

Codex must inspect existing code/docs first and must not invent new architecture when an existing pattern already exists.

## Recommended next local instruction

Continue FixTradeZone from `feature/packages-foundation`. Pull the latest
approved checkpoint, read `docs/LOCAL-VERIFY-PACKAGES.md`, and run the combined
PKG-01 acceptance: corrected ordered Postman flow, SQL/audit readback, ADMIN and
USER browser scenarios, then `npm run verify:milestone`. Do not push/open a PR
or call the slice complete until the Founder explicitly accepts those results.

## Fallback rule

If Work/Codex limits are reached, the feature is unavailable, or context is lost, resume in normal Chat from:

1. current Git branch/commit;
2. `docs/CURRENT-STATE.md`;
3. this operating brief;
4. relevant architecture/business-rule documents.

Do not ask the Founder to reconstruct completed work from memory when the repository can answer it.
