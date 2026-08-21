# FixTradeZone — Current State

## Latest Verified Checkpoint — 2026-08-21

- PR #9 is merged into `main` at merge commit `c398986`.
- Current feature branch: `agent/user-impersonation`.
- Current branch contains the locally verified User Impersonation, Security Configuration, Session Reauthentication, Idle Lock, User Shell, and Users UI completion milestone.
- FixTradeZone Dark Neo remains the single approved protected-application design system.
- Dashboard design remains locked and was not redesigned by this milestone.
- Protected administrator pages use the shared AdminShell/Startbar/Topbar.
- Protected USER impersonation pages use the USER shell while reusing the same approved master sidebar/topbar visual system.
- Application pages must retain sidebar + topbar unless the Founder explicitly approves an exception.
- `/users` now uses the full available desktop content width while wide tables retain internal horizontal scrolling on smaller screens.

## User Impersonation

Implemented and locally verified:

- `users.impersonate` is an RBAC permission.
- SUPER_ADMIN may impersonate eligible ordinary USER accounts.
- ADMIN may impersonate only when `users.impersonate` is present in its effective permission scope.
- ADMIN, SUPER_ADMIN, self, non-USER, and non-ACTIVE subjects are not eligible impersonation targets.
- Impersonation uses a dedicated JWT/session boundary and not the normal administrator JWT boundary.
- Impersonation tokens cannot authenticate against administrator APIs.
- Impersonation sessions retain both original actor identity and selected USER identity.
- One active impersonation is allowed per administrator authentication session.
- Impersonation start/stop is audited.
- Return-to-Admin remains available even if the actor's impersonation permission changes after session start.
- The browser receives impersonation state through same-origin Next.js BFF routes and HttpOnly cookies.
- `/user/impersonation` resolves the selected live USER account from the backend.
- The USER shell displays the selected USER identity and persistent Return-to-Admin controls.
- Administrator permissions are never inherited by the impersonated USER identity.

## Full vs Limited Impersonation

- SUPER_ADMIN controls `fullUserImpersonationEnabled`.
- `LIMITED` mode is the safe support boundary.
- `FULL` mode enables the full-user authorization boundary for implemented USER-side APIs.
- The effective mode is evaluated live from security configuration; an existing impersonation session can move between LIMITED and FULL without token reissue.
- Sensitive/full USER APIs must use the server-side full-impersonation authorization guard.
- FULL impersonation does not grant administrator authority to the selected USER identity.
- Complete USER business modules will be added as their vertical slices are implemented; the current user view is the verified live-account/session foundation.

## Security Configuration

Local migration `0004_security_configuration` is applied and verified.

The singleton configuration currently supports:

- `fullUserImpersonationEnabled`
- `idleLockMinutes`
- `updatedByUserId`
- audit metadata

Rules:

- Configuration is SUPER_ADMIN-only.
- Default idle lock is 5 minutes.
- Valid idle lock range is 1–120 minutes.
- Database constraints and backend DTO/service validation enforce the allowed range.
- `/settings/security` is available only to SUPER_ADMIN.
- The SUPER_ADMIN sidebar profile includes a Security Configuration shortcut.

## Session Reauthentication and Idle Lock

Implemented and locally verified:

- Protected sessions expose the configured idle-lock policy.
- Inactivity displays a lock overlay without logging the current session out.
- Locking preserves the current page and in-memory UI state.
- Unlock requires password reauthentication.
- A normal administrator session reauthenticates the current administrator.
- During USER impersonation, unlock verifies the original ADMIN/SUPER_ADMIN actor password, not the selected USER password.
- Wrong passwords remain rejected.
- Correct reauthentication unlocks the same screen without redirecting or recreating the impersonation session.
- Administrator and USER shells both use the same shared idle-lock implementation.

## Database Migrations

Applied and verified locally:

- `0001_foundation_auth_rbac`
- `0002_auth_sessions`
- `0003_user_impersonation`
- `0004_security_configuration`

No additional application/shadow/test database was created.

## Verification Status

Backend:

- Production build passes.
- 18 test suites pass.
- 82 tests pass.
- Prisma schema/migrations are locally verified.
- Postman MASTER collection impersonation/security/session-policy flows are locally green.

Admin:

- ESLint passes for the changed milestone files.
- Next.js production build passes.
- Security Configuration UI is visually approved.
- USER impersonation shell is visually approved.
- Idle-lock behavior is locally verified for normal administrator and impersonated USER sessions.
- `/users` full-width desktop table behavior is visually approved.
- `git diff --check` passes.

## Security Boundaries Preserved

- JWT deny-by-default remains authoritative.
- RBAC remains backend-authoritative.
- SUPER_ADMIN founder protections remain intact.
- Impersonation JWTs cannot cross into administrator APIs.
- Administrator privileges do not leak into impersonated USER authorization.
- Tokens remain server-side/HttpOnly in the admin browser flow.
- Password hashes, refresh-token hashes, and raw credentials are not exposed.
- Financial rules remain unchanged.
- Simulated activity must remain explicitly labeled as simulated.

## Dependency Security Status

The Prisma 7.9.1 transitive `deepmerge-ts@7.1.5` advisory remains tracked.

Do not run `npm audit fix --force` and do not introduce an unverified dependency override.

## Immediate Next Actions

1. Synchronize persistent project documentation with this verified milestone.
2. Perform final backend/admin repository gates.
3. Review the complete feature diff and stage only the exact milestone files.
4. Create the local feature commit.
5. Push/open a pull request only after explicit Founder approval.
6. After merge, continue with the next approved vertical slice, currently Packages.

## Constraints

- Never create extra FixTradeZone application databases.
- Never use Prisma `migrate dev` without explicit shadow-database approval.
- Never expose secrets or authentication tokens.
- Never allow impersonation to inherit administrator authority.
- Never represent simulated trades/results as real.
- Never auto-credit deposits solely from TXID submission.
