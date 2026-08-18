# FixTradeZone — Security Standards

## Authentication
- JWT access + refresh token architecture.
- APIs are deny-by-default.
- Only intentionally public endpoints may use explicit `@Public()`.
- `/health` is intentionally public for monitoring.
- All user/admin/business APIs require JWT.
- Bearer format: `Authorization: Bearer <accessToken>`.

## Passwords
- Hash passwords with Argon2.
- Never store plaintext passwords.
- Never return password hashes.

## Authorization
- Authentication establishes identity.
- RBAC establishes role membership.
- Permissions protect privileged/admin operations.
- Financial approval actions are authorization-protected and audited.

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
