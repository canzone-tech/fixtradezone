# FixTradeZone — Current State

## Latest Verified Checkpoint — 2026-08-25

MLM-01 Referral Foundation is implemented and locally accepted end to end.

### Current branches
- Slice branch: `feature/mlm-referral-foundation`
- Frontend child branch used for the integrated slice: `feature/mlm-referral-frontend`
- Accepted frontend checkpoint before documentation seal: `039635cbcd29ada5436d1dbbd47dd0537dcb4aea`
- No PR to `main` has been opened yet.

### MLM-01 backend
Implemented and verified:
- referral profile / sponsor relationship foundation;
- sponsor-change history;
- singleton referral configuration;
- registration referral attribution;
- configured default sponsor behavior;
- SUPER_ADMIN referral configuration;
- permission-gated delegated ADMIN sponsor reassignment;
- self-sponsor and cycle protection;
- audited manual sponsor changes;
- direct referral query API.

USER API:
- `GET /referrals/me`
- `GET /referrals/me/direct?page=1&limit=20`

ADMIN/SUPER_ADMIN API:
- `GET /admin/referrals/config`
- `PATCH /admin/referrals/config`
- `PATCH /admin/referrals/:userId/sponsor`

Registration accepts optional `referralCode`.

### MLM-01 database
Migration `0006_referral_foundation` is applied locally.

Database migration status at the accepted milestone:
- 6 migrations found;
- schema up to date;
- no additional FixTradeZone application/shadow/test database created.

Application-enforced referral invariants include:
- no self-sponsor;
- no referral cycles;
- assignment-state consistency;
- controlled root/default sponsor behavior;
- reasoned/audited sponsor changes.

Existing-user migration mode remains `LEAVE_UNASSIGNED_FOR_REVIEW`; historical sponsor relationships are never guessed.

### MLM-01 frontend / BFF
USER:
- `/user/referrals`
- live referral assignment status;
- live sponsor display;
- live direct-referral list;
- shareable invite link `register?ref=<REFERRAL_CODE>`;
- `/user/dashboard` shows live referral status and direct-referral total instead of the old referral API placeholder.

ADMIN/SUPER_ADMIN:
- `/referrals`
- referral enrollment configuration;
- default sponsor selection;
- delegated ADMIN sponsor-change switch;
- audited sponsor assignment/reassignment controls;
- permission-aware navigation.

BFF/session behavior:
- protected browser calls use same-origin Next.js BFF routes;
- browser JavaScript does not own backend JWTs;
- session refresh/validation runs before dependent referral data requests to avoid rotating-refresh-token races;
- registration BFF forwards explicit `referralCode` or a same-origin `?ref=` invite code to the Nest registration contract.

## Verification — GREEN

### Repository code gate
Latest local `npm run verify:local` on the accepted frontend checkpoint:
- Prisma schema validation: GREEN;
- backend Prettier check: GREEN;
- backend ESLint: GREEN;
- backend Jest: 24/24 suites, 129/129 tests;
- NestJS production build: GREEN;
- backend diff checks: GREEN;
- admin ESLint: GREEN;
- admin TypeScript `tsc --noEmit`: GREEN;
- Next.js 16.3.1 production build: GREEN;
- root diff checks: GREEN.

### Database milestone gate
Latest local `npm run verify:milestone` before final UI acceptance:
- all repository code gates GREEN;
- Prisma migration status GREEN;
- 6 migrations applied / schema up to date.

### API checkpoint
MLM-01 Postman referral collection: GREEN.

The hardened referral collection covered success, authentication, authorization, validation, self-sponsor, cycle, delegated ADMIN switch/permission behavior, configuration restoration and token refresh behavior.

### Integrated API + frontend acceptance — GREEN
Verified locally in browser on 2026-08-25:
1. SUPER_ADMIN opened `/referrals` and loaded live referral configuration.
2. Referral enrollment was enabled with the configured founder/root as default sponsor.
3. Fresh USER A registered, was activated, logged in, and showed `ASSIGNED` referral state with founder/root as sponsor.
4. USER A dashboard showed live referral state and direct referral count.
5. USER A copied the generated referral invite link.
6. Fresh USER B registered through USER A's `register?ref=<CODE>` invite link.
7. USER B was activated and showed USER A as sponsor.
8. USER A's `/user/referrals` direct-referral list updated to include USER B as `ACTIVE / ASSIGNED`.
9. USER A direct-referral total increased accordingly.

This proves the accepted path across frontend -> Next.js BFF -> Nest API -> MySQL -> frontend readback.

MLM-01 final module sign-off is therefore GREEN.

## Locked delivery workflow
For future modules:
1. confirm business semantics;
2. implement focused backend/API foundation;
3. use local API/Postman as an intermediate checkpoint;
4. implement matching frontend/BFF/UI;
5. run repository verification;
6. run database milestone verification when relevant;
7. run final API + frontend integrated local acceptance;
8. update persistent docs;
9. open PR only after all gates are green.

Work/Codex may accelerate planning and implementation, but local verification remains the acceptance authority. GitHub repository + committed `docs/` remain the source of truth.

## Core architecture / security state
- Backend: NestJS + TypeScript.
- ORM: Prisma 7.9.1 with MariaDB adapter.
- Relational source of truth: MySQL.
- MongoDB reserved for document/config/CMS use where appropriate.
- Redis used for transient/cache/session-adjacent infrastructure.
- Frontend/admin/user portal: Next.js.
- JWT access + rotating refresh sessions.
- Browser auth boundary: same-origin BFF + HttpOnly/SameSite cookies.
- RBAC roles: `SUPER_ADMIN`, `ADMIN`, `USER`.
- SUPER_ADMIN remains founder/master authority.
- APIs remain deny-by-default except explicitly public endpoints.
- Financial modules must preserve SQL DECIMAL, idempotency, auditability, immutable/reversal ledger patterns and explicit authorization.
- Simulated activity must always be explicitly labeled simulated and never presented as real trading/profits.

## Foundation history
The reusable authentication/account/admin/frontend foundation remains complete and green:
- configurable authentication and registration;
- rotating sessions;
- required password change;
- custom Redis-backed CAPTCHA;
- users administration;
- RBAC roles/permissions;
- security configuration / reauthentication / idle lock;
- secure USER impersonation boundary;
- Dark Neo ADMIN and USER portal shell;
- role-aware login routing;
- USER dashboard/profile;
- canonical FixTradeZone logo and shared sign-out behavior.

Historical detail is retained in `CHANGELOG.md`, `PROJECT-CONTEXT.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `DATABASE.md`, `SECURITY.md` and `API-CONTRACT.md`.

## Immediate Next Actions
1. Integrate `feature/mlm-referral-frontend` back into `feature/mlm-referral-foundation` by fast-forward only.
2. On local machine, switch to the foundation branch and run `npm run verify:milestone` from the integrated branch state.
3. Do not repeat the already-green browser journey unless the integration commit changes executable code; a branch-pointer-only fast-forward does not invalidate the accepted UI/API evidence.
4. Update the Work/Codex handoff checkpoint.
5. Prepare the next business-domain slice in Work/Codex using the existing locked MLM rules; no dependent implementation should proceed until any new ambiguous business semantics are explicitly locked.
6. Open the single MLM referral PR to `main` only when the final integrated foundation branch gate is green.

## Constraints
- Never create extra FixTradeZone application databases without explicit approval.
- Never use Prisma `migrate dev` without explicit shadow-database approval.
- Never expose secrets, tokens, password material or CAPTCHA HMAC secrets.
- Never weaken JWT/RBAC/audit/security invariants through configuration.
- Never auto-credit deposits from TXID submission alone.
- Never represent simulated trades/results as real.
- Do not bypass failed gates to obtain a green result.
