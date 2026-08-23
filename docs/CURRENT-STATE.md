# FixTradeZone — Current State

## Latest Verified Checkpoint — 2026-08-23

- Current feature branch: `feature/configurable-auth-registration`.
- Base commit: `0bc78b5` (PR #10 merged into `main`).
- Configurable authentication and registration foundation is implemented and locally verified.
- Migration `0005_configurable_auth_registration` is applied and verified in local MySQL.
- Redis application infrastructure is implemented and live connectivity is verified.
- Custom server-authoritative CAPTCHA is implemented for public Login and Registration.
- Backend regression status: 23 test suites / 124 tests pass.
- NestJS production build passes.
- Feature-only ESLint passes.
- `git diff --check` passes.
- Local Postman verification is GREEN.
- No pull request has been opened for this feature yet.

## Configurable Authentication

SUPER_ADMIN-controlled authentication settings:

- Login with username.
- Login with email.
- Login with mobile.
- CAPTCHA on Login.
- CAPTCHA on Registration.

Rules:

- At least one login identifier must remain enabled.
- Username is the canonical human account handle and remains unique.
- JWT/session identity is based on immutable user/session IDs, not email.
- Email and mobile may be nullable.
- When multiple accounts per email or mobile are enabled, username-only login is enforced.
- Email/mobile login rejects ambiguous identifier matches.
- E.164 mobile login is supported.
- Login credential failures remain generic.

## Configurable Registration

SUPER_ADMIN-controlled registration settings:

- Public registration.
- SUPER_ADMIN-created registration.
- ADMIN-created registration.
- Authorized USER-created registration.
- Email required.
- Mobile required.
- Password mode:
  - AUTO
  - MANUAL
  - AUTO_OR_MANUAL
- Username mode:
  - AUTO
  - MANUAL
  - AUTO_OR_MANUAL
- Optional generated-username prefix.
- Multiple accounts per email.
- Multiple accounts per mobile.

Registration sources remain independently auditable:

- SELF_REGISTRATION
- SUPER_ADMIN
- ADMIN
- AUTHORIZED_USER

`createdBy` and future sponsor/referral relationships remain separate concepts.

## Generated Username and Identifier Claims

- Username is required and unique.
- Automatic usernames use the transactional `username` system sequence.
- Current local sequence starts from `100001`.
- Optional username prefix affects future generated usernames only.
- `user_identifier_claims` enforces EMAIL/MOBILE uniqueness while the related identifier is configured for single-account mode.
- SINGLE -> MULTIPLE removes the related uniqueness claims.
- MULTIPLE -> SINGLE rejects existing duplicate users and rebuilds claims transactionally.

## Required Password Change

Automatically generated passwords are temporary credentials.

A user with `mustChangePassword=true`:

- does not receive a normal access token;
- does not receive a normal refresh token;
- does not receive a normal authenticated session;
- receives only a short-lived one-purpose `password_change` JWT;
- must submit a different new password;
- has active sessions revoked defensively;
- has the flag cleared atomically after successful password replacement;
- must sign in again after successful password change.

Password-change replay and concurrent update races are rejected.

## CAPTCHA

Custom CAPTCHA is implemented without a third-party CAPTCHA service.

Security properties:

- Public challenge endpoint: `POST /auth/captcha`.
- Purposes:
  - LOGIN
  - REGISTRATION
- CAPTCHA configuration is SUPER_ADMIN-controlled.
- Challenge state is stored in Redis.
- Challenge TTL is 180 seconds.
- Maximum failed attempts: 5.
- Successful verification consumes the challenge atomically.
- Fifth failed attempt destroys the challenge.
- Challenge is bound to its declared purpose.
- Redis stores only a keyed HMAC digest of the answer, never the plaintext answer.
- Challenge IDs are cryptographically random.
- CAPTCHA is fail-closed when enabled.
- When disabled, existing Login/Registration behavior remains unchanged.

## Redis Foundation

- `ioredis` is used by the backend.
- Redis configuration uses existing `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD`.
- `CAPTCHA_HMAC_SECRET` is required and must contain at least 32 characters.
- Application Redis lifecycle connection/disconnection is managed by `RedisService`.
- Local Redis connection is verified with `PING -> PONG`.

## Database Migration State

Applied and verified locally:

- `0001_foundation_auth_rbac`
- `0002_auth_sessions`
- `0003_user_impersonation`
- `0004_security_configuration`
- `0005_configurable_auth_registration`

Migration `0005_configurable_auth_registration` verified:

- `users.username` is required and unique.
- `users.email` is nullable and indexed without a direct unique constraint.
- `users.phone` is nullable and indexed without a direct unique constraint.
- `users.phoneVerifiedAt` exists.
- `users.mustChangePassword` exists.
- `user_identifier_claims` exists.
- `system_auth_config` exists.
- `system_registration_config` exists.
- `system_sequences` exists.
- Authentication and registration singleton defaults are seeded.
- Existing EMAIL/MOBILE claims were backfilled.

No additional FixTradeZone application/shadow/test database was created.

## Local Verification Status

Backend:

- 23 test suites pass.
- 124 tests pass.
- NestJS production build passes.
- Feature-only ESLint passes.
- `git diff --check` passes.
- Prisma migration `0005` is locally applied and verified.
- Redis connectivity is locally verified.
- Postman Configurable Auth / Registration / CAPTCHA APIs are GREEN.

## Security Boundaries Preserved

- APIs remain deny-by-default.
- Only explicitly public endpoints bypass the global JWT guard.
- RBAC remains backend-authoritative.
- SUPER_ADMIN founder protections remain intact.
- Configuration mutation remains SUPER_ADMIN-only.
- JWT identity is not coupled to mutable email/mobile identifiers.
- Plaintext passwords are never stored.
- CAPTCHA answers are never stored in plaintext.
- Refresh-token hashes remain non-reversible.
- Impersonation boundaries remain isolated.
- Financial security rules remain unchanged.
- Simulated trade activity must remain explicitly labeled as simulated.

## Immediate Next Actions

1. Synchronize persistent project documentation with this verified milestone.
2. Review and stage only the exact feature files.
3. Create the local feature commit.
4. Push the feature branch.
5. Open a pull request only after explicit Founder approval.
6. Merge only after CI/review is green.
7. Continue reusable-foundation freeze/verification before starting Packages.

## Constraints

- Never create extra FixTradeZone application databases.
- Never use Prisma `migrate dev` without explicit shadow-database approval.
- Never expose secrets, CAPTCHA HMAC secrets, tokens, or password material.
- Never weaken JWT/RBAC/audit/security invariants through configuration.
- Never auto-credit deposits from TXID submission alone.
- Never represent simulated trades/results as real.
