# FixTradeZone — Security Standards

## Authentication

- JWT access + refresh token architecture.
- Access tokens expire after 15 minutes.
- Refresh tokens expire after 7 days and rotate on every successful refresh.
- Only SHA-256 refresh-token hashes are stored in MySQL.
- Logout revokes the persisted refresh session; refresh-token reuse revokes all active sessions for the user.
- APIs are deny-by-default.
- Only intentionally public endpoints may use explicit `@Public()`.
- `/health` is intentionally public for monitoring.
- All user/admin/business APIs require JWT.
- Bearer format: `Authorization: Bearer <accessToken>`.
- Access and refresh JWTs are restricted to HS256 and verify explicit issuer/audience values.
- The JWT strategy reloads the active session plus the user's current status, roles, and permissions from MySQL for protected requests.
- Revoking a persisted session immediately invalidates access JWTs bound to that session.

## Passwords

- Hash passwords with Argon2id using at least 19 MiB memory, 2 iterations, and parallelism 1.
- Argon2 generates a unique salt for each password hash.
- Never store plaintext passwords.
- Never return password hashes.
- Registration passwords must contain 12–128 characters.
- Password input is never trimmed or normalized; every submitted character is significant.
- Login accepts any non-empty password up to 128 characters so authentication does not expose registration-policy details.

## Request Validation

- A global NestJS `ValidationPipe` validates concrete DTO classes.
- Unknown request fields are rejected instead of silently accepted.
- Implicit primitive conversion is disabled.
- Validation errors must not echo the original object or submitted value.
- Email addresses and usernames are trimmed and normalized to lowercase.
- Optional phone numbers use E.164 format.
- Refresh and logout tokens must be JWT-shaped strings and are cryptographically verified by the authentication service before use.

## Registration Controls

- Registration is explicitly public; other business routes remain deny-by-default.
- Password hashing happens before opening the database transaction.
- User creation, default USER role assignment, and registration audit creation are transactional.
- Duplicate identifiers return a controlled conflict and never create a partial user.
- Registration responses use an explicit safe projection and never include password hashes.

## Authorization

- Authentication establishes identity.
- RBAC establishes role membership.
- Permissions protect privileged/admin operations.
- Financial approval actions are authorization-protected and audited.
- The admin UI rejects non-ADMIN accounts, but every future admin data endpoint must also enforce RBAC in NestJS.

## Admin Browser Session

- The browser submits credentials only to same-origin Next.js route handlers.
- The Next.js server exchanges credentials and refresh tokens with NestJS.
- Access and refresh tokens use HttpOnly, Secure-in-production, SameSite=Strict cookies.
- Tokens are never returned to admin client-side JavaScript or stored in localStorage/sessionStorage.
- BFF auth routes reject browser requests explicitly marked as cross-site and validate successful API response shapes before setting cookies.
- CSP, HSTS in production, framing, MIME, cross-origin, referrer, and browser-permission headers are configured.

## User Impersonation Security

- User impersonation requires the `users.impersonate` permission.
- Eligible subjects are ordinary ACTIVE USER accounts only.
- Administrator, SUPER_ADMIN, self, and otherwise ineligible subjects cannot be impersonated.
- Impersonation uses a dedicated JWT audience and session boundary separate from normal administrator access tokens.
- The normal JWT strategy rejects impersonation tokens.
- Impersonation session validation reloads live actor session/authority and subject state from MySQL.
- Impersonation tokens cannot authenticate against `/admin/*` APIs.
- Original actor identity and selected USER identity are retained independently for authorization and audit.
- Impersonation start and stop actions are audited.
- Return-to-Admin remains safe even when `users.impersonate` is later revoked from the actor.
- The browser stores the impersonation token only in a server-managed HttpOnly/SameSite cookie.
- Administrator privileges must never be inherited by the selected USER authorization context.

## Full Impersonation Security

- `fullUserImpersonationEnabled` is controlled only by SUPER_ADMIN.
- LIMITED mode is the safe support boundary.
- FULL mode enables full USER-side authorization only for implemented USER APIs that explicitly support the full impersonation boundary.
- FULL mode never grants ADMIN or SUPER_ADMIN authority to the impersonated USER.
- The effective FULL/LIMITED state is evaluated live from the database rather than permanently encoded into the impersonation token.
- Sensitive/full USER endpoints must enforce the server-side full-impersonation guard; UI visibility alone is never an authorization boundary.

## Security Configuration and Idle Lock

- System security configuration is a singleton MySQL record.
- Only SUPER_ADMIN may read/change privileged security configuration.
- Idle-lock duration defaults to 5 minutes and is restricted to 1–120 minutes.
- The allowed range is enforced by database constraints, DTO validation, and service validation.
- `GET /auth/session-policy` exposes only the safe idle-lock duration to authenticated sessions.
- Password reauthentication is required to unlock an idle-locked browser session.
- Idle lock does not log the session out and preserves the current route/UI state.
- During impersonation, unlock verifies the original ADMIN/SUPER_ADMIN actor password rather than the selected USER password.
- Successful reauthentication is audited.
- Wrong password, missing user, inactive user, and equivalent invalid reauthentication cases return a generic unauthorized response.
- Browser reauthentication is performed through the same-origin BFF and preserved administrator HttpOnly cookies.

## Financial Security

- TXID submission does not auto-credit balance.
- Deposit is PENDING until authorized admin approval.
- Duplicate TXIDs are prevented.
- Never store wallet private keys/seed phrases.
- Financial values use DECIMAL.
- Ledger entries are immutable where appropriate.

## Package-Plan Security and Integrity — PKG-01

- USER sees only one currently effective `PUBLISHED` plan; unpublished drafts
  never leak through the catalogue API.
- SUPER_ADMIN has implicit package authority. ADMIN receives no package
  permissions automatically.
- Delegated draft reads require `packages.read`; draft changes require
  `packages.draft.manage`.
- Publication, published-plan closure and effective-date authority remain
  SUPER_ADMIN-only and cannot be delegated.
- Every draft command requires an audit reason and expected aggregate revision.
- Stale or concurrent writes fail instead of silently overwriting another
  administrator's work.
- Draft mutation, revision increment and before/after audit are committed in the
  same serializable transaction.
- Published commercial terms are immutable. Corrections clone into a new draft.
- Publication rejects backdating, ambiguous overlaps and any current contract
  violation.
- Package prices/rates/multipliers use exact SQL `DECIMAL` and are serialized as
  strings.
- Package browser calls use same-origin Next.js BFF routes; access and rotating
  refresh tokens remain HttpOnly/SameSite cookies and are never returned to UI
  code.
- ADMIN shell/package clients share one in-flight session resolution before
  dependent package requests, preventing concurrent refresh-token consumption.
- Package BFF success and error responses are marked `Cache-Control: no-store`.
- PKG-01 creates no user package, balance, earnings, cap-consumption, deposit or
  ledger state and exposes no activation endpoint.

## Secrets

- Local `.env`, production secret manager.
- `.env` must never be committed.
- Never expose secrets in logs, API responses, Postman collections, or documentation.

## Operational Security

- Validate request input with DTOs and class-validator.
- Rate-limit authentication and sensitive endpoints.
- Audit important admin/financial actions.
- Do not leak credentials/tokens in logs.
- Production uses TLS and secure secret management.

## Dependency Security

- Do not blindly run `npm audit fix --force`.
- Investigate advisories and compatibility first.
- Review install-script approval warnings before approving.

## Known Dependency Advisory

As of 2026-08-18, `npm audit` reports 3 high-severity findings for
`deepmerge-ts@7.1.5`, pulled transitively by `@prisma/config@7.9.1`.

Prisma 7.9.1 declares `deepmerge-ts` version `7.1.5`. Installing
`deepmerge-ts@8.0.1` directly does not replace Prisma's nested dependency.

Do not run `npm audit fix --force`, because npm proposes a breaking downgrade
to Prisma 6.12.0.

Do not add an unverified npm override for `deepmerge-ts` 8.x.

The advisory is tracked and will be reassessed when Prisma publishes a
compatible security update or an officially supported remediation becomes
available.

## Configurable Authentication & CAPTCHA — 2026-08-23

- Authentication identity uses immutable user/session IDs rather than mutable email/mobile identifiers.
- Username remains required and unique.
- Multiple-account email/mobile configuration forces username-only login.
- SUPER_ADMIN alone may mutate authentication and registration configuration.
- Generated passwords set `mustChangePassword=true` and cannot create normal access/refresh sessions.
- Required password replacement uses a short-lived one-purpose JWT and atomic state transition.
- CAPTCHA state is stored temporarily in Redis.
- CAPTCHA challenges expire after 180 seconds and allow at most 5 failed attempts.
- Successful CAPTCHA verification consumes the challenge atomically.
- Challenges are purpose-bound to LOGIN or REGISTRATION.
- Redis stores only HMAC-SHA256 answer digests, never plaintext answers.
- `CAPTCHA_HMAC_SECRET` must contain at least 32 characters and must never be committed or exposed.
- Enabled CAPTCHA requirements fail closed.
