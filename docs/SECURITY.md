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

## Financial Security
- TXID submission does not auto-credit balance.
- Deposit is PENDING until authorized admin approval.
- Duplicate TXIDs are prevented.
- Never store wallet private keys/seed phrases.
- Financial values use DECIMAL.
- Ledger entries are immutable where appropriate.

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
