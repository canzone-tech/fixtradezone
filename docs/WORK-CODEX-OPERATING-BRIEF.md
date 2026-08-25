# FixTradeZone Work / Codex Operating Brief

## Purpose
This is the canonical handoff brief for continuing FixTradeZone through ChatGPT Work, Codex, or normal Chat without losing architecture, delivery discipline, or repository continuity.

GitHub repository + committed `docs/` remain the permanent source of truth. Work and Codex are acceleration layers, not sources of truth.

## Current checkpoint — 2026-08-25
- Slice branch: `feature/mlm-referral-foundation`
- Frontend child branch: `feature/mlm-referral-frontend`
- MLM-01 backend API/Postman gate: GREEN.
- MLM-01 frontend/BFF: implemented.
- Integrated browser + API acceptance: GREEN.
- Backend code gate: 24 suites / 129 tests GREEN.
- Prisma milestone: 6 migrations, schema up to date GREEN.
- Admin/Next.js lint, typecheck and production build: GREEN.
- USER dashboard referral summary is live and no longer shows the old referral API placeholder.
- No PR to `main` yet.

## Accepted end-to-end proof
The locally accepted MLM-01 flow proved:
1. SUPER_ADMIN referral configuration loaded and saved through the UI.
2. Fresh USER A registered and was activated.
3. USER A showed `ASSIGNED` referral state under the configured founder/root default sponsor.
4. USER A copied the generated `register?ref=<REFERRAL_CODE>` invite link.
5. Fresh USER B registered through USER A's invite link.
6. USER B was activated and showed USER A as sponsor.
7. USER A's live direct-referral list showed USER B as `ACTIVE / ASSIGNED`.
8. USER A's direct-referral total updated in the live referral workspace/dashboard.

This validates frontend -> Next.js BFF -> Nest API -> MySQL -> frontend readback for the accepted referral path.

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
- Child branches are allowed for frontend/backend work inside the same vertical slice.
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
- Financial calculations use SQL `DECIMAL`, immutable/auditable ledger patterns, idempotency, reversal entries, and explicit permissions.
- Do not model commissions/rewards by unsafe mutable balance increments.
- Plan/config versions must preserve historical calculations.
- `SUPER_ADMIN` is founder/master authority; `ADMIN` has delegated, explicit permissions only.
- Simulated activity must always be clearly labeled simulated; never present fake trades/profits as real.

## MLM / referral rules already locked
- Valid referral code assigns sponsor.
- No referral code uses configured default/company sponsor; never hardcode founder identity.
- Sponsor is normally permanent; exceptional reassignment is controlled, reasoned, audited, and cycle/self-sponsor safe.
- Referral levels/rates are configurable.
- Matching base: `MIN(receiver active package, downline package) * level %`.
- Matching enablement, triggers, compression/pass-up, package modes, refunds/reversals, team-business qualification, awards, upgrades, release timing, caps, plan migration, referral-code mode, root/default routing, reward timing/rates/cycles, activation/start rules, day counting and existing-user migration are configurable according to the persistent MLM business-rules document.
- Existing-user initial migration mode is `LEAVE_UNASSIGNED_FOR_REVIEW`.
- Never guess historical sponsor relationships.

## MLM-01 database foundation
Models/tables include:
- referral profiles;
- sponsor-change history;
- singleton referral system config.

Important application-enforced invariants include:
- no self-sponsor;
- no cycles;
- assignment-state consistency;
- controlled root/default sponsor behavior;
- audited manual sponsor changes.

Migration `0006_referral_foundation` is applied locally and migration status is green.

## MLM-01 API surface
USER:
- `GET /referrals/me`
- `GET /referrals/me/direct?page=1&limit=20`

ADMIN/SUPER_ADMIN:
- `GET /admin/referrals/config`
- `PATCH /admin/referrals/config`
- `PATCH /admin/referrals/:userId/sponsor`

Registration accepts optional `referralCode`.

## MLM-01 frontend surface
USER:
- `/user/referrals`
- live referral profile;
- live direct-referral list;
- sponsor display;
- shareable invite link `register?ref=<REFERRAL_CODE>`;
- `/user/dashboard` live referral state and direct-referral total.

ADMIN/SUPER_ADMIN:
- `/referrals`
- referral config controls;
- sponsor-management UI;
- permission-aware navigation.

Next.js BFF routes proxy protected calls and refresh/validate the browser session before dependent referral data requests to avoid rotating-refresh-token races.

Registration BFF forwards an explicit `referralCode`, or a same-origin `?ref=` invite code, to the Nest registration contract.

## Immediate next action
1. Fast-forward `feature/mlm-referral-foundation` to the latest accepted frontend/docs checkpoint.
2. On local machine switch to `feature/mlm-referral-foundation` and run:

```bash
npm run verify:milestone
```

3. If green, MLM-01 is fully sealed on the slice branch.
4. Use Work for next-slice business semantics and architecture planning.
5. Use Codex for implementation only after the next slice contract is explicit.
6. Open the single MLM referral PR to `main` only after the final foundation-branch milestone gate is green.

The already-green browser journey does not need to be repeated after a branch-pointer-only fast-forward because executable code is unchanged.

## Work / Codex usage
Use Work for:
- resolving pending business questions;
- sequencing modules;
- architecture/security reviews;
- specifications and persistent docs.

Use Codex for:
- repository implementation;
- focused refactors;
- tests;
- lint/type/build fixes;
- safe parallel work on independent tasks.

Codex must inspect existing code/docs first and must not invent new architecture when an existing pattern already exists.

## Fallback rule
If Work/Codex limits are reached, the feature is unavailable, or context is lost, resume in normal Chat from:
1. current Git branch/commit;
2. `docs/CURRENT-STATE.md`;
3. this operating brief;
4. relevant architecture/business-rule documents.

Do not ask the Founder to reconstruct completed work from memory when the repository can answer it.
