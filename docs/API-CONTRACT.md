# FixTradeZone — API Contract & Testing

## Development Base URL

`http://localhost:3000`

## Current Public Endpoint

`GET /health`

Expected shape:

```json
{
  "status": "ok",
  "services": {
    "mysql": "up"
  },
  "timestamp": "...",
  "responseTimeMs": 6
}
```

## JWT Rule

Protected endpoints use:
`Authorization: Bearer {{accessToken}}`

Access JWTs use HS256, the `fixtradezone-api` issuer, the `fixtradezone-clients` audience, and a persisted session ID. Refresh JWTs use the separate refresh secret and `fixtradezone-sessions` audience.

## Auth Endpoint Status

- `POST /auth/register` — implemented and locally verified
- `POST /auth/login` — implemented and locally verified
- `POST /auth/refresh` — implemented and locally verified
- `POST /auth/logout` — implemented and locally verified
- `GET /auth/me` — implemented and locally verified
- `POST /auth/reauthenticate` — implemented and locally verified
- `GET /auth/session-policy` — implemented and locally verified

The request DTO layer is implemented for the planned authentication lifecycle.

## Auth Request Validation

All DTO-backed request bodies reject unknown fields.

### Register

```json
{
  "email": "user@example.com",
  "password": "a-password-of-at-least-12-characters",
  "username": "trader.one",
  "phone": "{{userPhoneE164}}",
  "firstName": "Prashant",
  "lastName": "Shukla"
}
```

| Field       | Required | Validation                                                                 |
| ----------- | -------: | -------------------------------------------------------------------------- |
| `email`     |      Yes | Valid email, maximum 191 characters; trimmed and lowercased                |
| `password`  |      Yes | String, 12–128 characters; never trimmed or normalized                     |
| `username`  |       No | 3–30 characters; lowercase letters, numbers, period, underscore, or hyphen |
| `phone`     |       No | E.164 format                                                               |
| `firstName` |       No | Trimmed string, 1–100 characters                                           |
| `lastName`  |       No | Trimmed string, 1–100 characters                                           |

A successful registration returns HTTP 201 with a safe user projection, `PENDING` status, and the assigned `USER` role. Passwords and password hashes are never returned.

Duplicate email, username, or phone identifiers return HTTP 409. Invalid or unknown fields return HTTP 400. User creation, role assignment, and the registration audit event are committed in one database transaction.

### Login

```json
{
  "email": "user@example.com",
  "password": "submitted-password"
}
```

Email is normalized. Password must be a non-empty string no longer than 128 characters.

A successful login returns HTTP 200:

```json
{
  "message": "Login successful.",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 604800,
  "accessToken": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "username": "trader.one",
    "phone": "{{userPhoneE164}}",
    "firstName": "Prashant",
    "lastName": "Shukla",
    "status": "ACTIVE",
    "createdAt": "2026-08-19T00:00:00.000Z",
    "lastLoginAt": "2026-08-19T00:01:00.000Z",
    "roles": ["ADMIN"],
    "permissions": []
  }
}
```

Unknown email, incorrect password, and non-ACTIVE account states all return HTTP 401 with the same `Invalid email or password.` message. A successful login persists only the SHA-256 refresh-token hash and records the session and login audit event transactionally.

### Refresh and Logout

```json
{
  "refreshToken": "<refresh-token>"
}
```

The request value must be a JWT-shaped string no longer than 4096 characters. DTO validation checks structure only; the authentication service must verify signature, expiry, token type, rotation state, and revocation state.

### Refresh

`POST /auth/refresh` is public at the guard layer because an access token may have expired, but the submitted refresh token must pass cryptographic and persisted-session verification. A successful refresh returns the same response shape as Login with `message: "Session refreshed."`, revokes the previous refresh session, and creates the replacement session transactionally.

Reusing a rotated refresh token returns HTTP 401 and revokes all remaining active refresh sessions for that user. The event is audited.

### Logout

`POST /auth/logout` verifies the refresh token and idempotently revokes its persisted session. A successful or already-completed logout returns HTTP 200:

```json
{
  "message": "Logout successful."
}
```

### Current User

`GET /auth/me` requires `Authorization: Bearer {{accessToken}}`. The JWT strategy reloads the bound active session plus the user's current RBAC data from MySQL. Missing, expired, or revoked sessions; changed users/emails; and PENDING/SUSPENDED/BLOCKED users return HTTP 401.

Successful response:

```json
{
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "username": "trader.one",
    "phone": "{{userPhoneE164}}",
    "firstName": "Prashant",
    "lastName": "Shukla",
    "status": "ACTIVE",
    "createdAt": "2026-08-19T00:00:00.000Z",
    "lastLoginAt": "2026-08-19T00:01:00.000Z",
    "roles": ["ADMIN"],
    "permissions": []
  }
}
```

## User Impersonation and Security Configuration

### Start User Impersonation

`POST /admin/users/:userId/impersonation`

Requires effective `users.impersonate` authority and an eligible ACTIVE ordinary USER target.

Impersonation uses a dedicated persisted session and dedicated JWT boundary. The browser receives it only through the same-origin Next.js BFF using HttpOnly cookies.

### Return to Administrator

`DELETE /admin/users/impersonation`

Ends the active impersonation for the current administrator authentication session. Return-to-Admin remains available even if the actor later loses `users.impersonate`.

### Current Impersonated USER Session

`GET /user/impersonation/session`

Requires the dedicated impersonation token and returns the selected USER identity, original administrator actor, live FULL/LIMITED mode, and idle-lock policy.

Impersonation tokens cannot authenticate against the administrator JWT boundary.

### Security Configuration

`GET /admin/settings/security`

`PATCH /admin/settings/security`

SUPER_ADMIN-only.

Configuration fields:

- `fullUserImpersonationEnabled`
- `idleLockMinutes` — integer from 1 through 120

FULL/LIMITED mode is evaluated live and therefore does not require impersonation-token reissue.

### Session Policy

`GET /auth/session-policy`

Requires normal authenticated access and returns the safe idle-lock policy.

### Password Reauthentication

`POST /auth/reauthenticate`

Requires normal authenticated access and verifies the submitted password against the current authenticated actor.

During USER impersonation, idle-lock unlock reauthenticates the preserved original ADMIN/SUPER_ADMIN actor session rather than the selected USER.

## Planned Core Areas

Users, Admin, Packages, AI Agents, Deposits, Wallet/Ledger, Referrals, Commissions, Rewards, Simulated Trades, CMS.

## Postman

Postman is installed and configured. Health and Register are verified. During local feature validation, Login must save `accessToken` and `refreshToken`, Refresh must replace both variables, the previous refresh token must fail, Me must work with the new access token, and Logout must make the latest refresh token unusable.

## Configurable Authentication, Registration & CAPTCHA — 2026-08-23

### CAPTCHA

`POST /auth/captcha`

Supported purposes:

- `LOGIN`
- `REGISTRATION`

When enabled, the endpoint returns an opaque challenge ID, SVG data URI, and a 180-second expiry. CAPTCHA answers are never returned or stored in plaintext.

### Login

`POST /auth/login`

Login now accepts a single `identifier` which may be username, email, or E.164 mobile according to SUPER_ADMIN configuration.

At least one login method must remain enabled. Multiple-account email/mobile modes require username-only login, and ambiguous email/mobile matches are rejected.

### Registration

`POST /auth/register`

Registration policy controls public/SUPER_ADMIN/ADMIN/authorized-USER registration, required identifiers, AUTO/MANUAL password mode, AUTO/MANUAL username mode, optional username prefix, and multiple-account behavior.

### Required Password Change

`POST /auth/change-required-password`

Automatically generated passwords are temporary. Successful temporary-password verification returns only a short-lived password-change token and does not establish a normal session.

### SUPER_ADMIN Configuration

- `GET /admin/settings/authentication`
- `PATCH /admin/settings/authentication`
- `GET /admin/settings/registration`
- `PATCH /admin/settings/registration`

## PKG-01 Packages / Plan Foundation — Backend Checkpoint

PKG-01 exposes catalogue configuration only. There is no purchase, payment,
activation, renewal, upgrade, reward, commission, balance or ledger endpoint.

All PKG-01 endpoints are authenticated and return `Cache-Control: no-store`.
Money, percentage and multiplier values are JSON strings.

### USER Effective Catalogue

`GET /packages`

Before the first effective publication:

```json
{
  "catalogueAvailable": false,
  "activationAvailable": false,
  "reason": "NO_EFFECTIVE_PUBLISHED_PLAN",
  "plan": null,
  "items": []
}
```

After publication, the response contains exactly one effective plan and every
non-`HIDDEN` item. `CLOSED_TO_NEW_ACTIVATIONS` remains visible with its explicit
availability. `activationAvailable` remains `false` throughout PKG-01.

Example exact values:

```json
{
  "price": "500.00000000",
  "minimumRewardRate": "0.800000",
  "maximumRewardRate": "1.000000",
  "capMultiplier": "3.0000",
  "maximumTotalReturn": "1500.00000000",
  "maximumProfit": "1000.00000000"
}
```

### ADMIN/SUPER_ADMIN Read APIs

- `GET /admin/package-plans` — requires `packages.read`.
- `GET /admin/package-plans/:planVersionId` — requires `packages.read`.

SUPER_ADMIN has implicit authority. ADMIN receives no package permission by
default and must be explicitly delegated through the existing RBAC workflow.

### Clone a Draft

`POST /admin/package-plans/drafts` — requires `packages.draft.manage`.

```json
{
  "sourcePlanVersionId": "<published-plan-uuid>",
  "reason": "Create the reviewed correction draft."
}
```

Only a published plan can be cloned. At most one active `DRAFT` is permitted.
The clone receives a new version number, revision 1, no effective dates and a
complete copy of the source items.

### Update Plan-Wide Draft Settings

`PATCH /admin/package-plans/:planVersionId` — requires
`packages.draft.manage`.

```json
{
  "expectedRevision": 3,
  "reason": "Record the reviewed plan-wide change.",
  "activationTrigger": "PAYMENT_APPROVED",
  "settlementTimezone": "UTC"
}
```

Supported settings are active-package mode/basis, activation trigger, migration
mode, renewal mode, upgrade switch and IANA settlement timezone. A successful
draft mutation increments the whole-plan revision.

For a `PUBLISHED` plan this endpoint accepts only a future finite `effectiveTo`,
requires SUPER_ADMIN in the service layer, and never allows retroactive closure.
Published commercial fields are immutable.

### Create a Draft Item

`POST /admin/package-plans/:planVersionId/items` — requires
`packages.draft.manage`.

The request includes `expectedRevision`, required audit `reason`, an existing
stable `packageCode`, and all typed item terms defined in
`PACKAGES-PLAN-FOUNDATION.md`. Duplicate definition, slug or sort order returns
HTTP 409 without changing the aggregate revision.

### Update a Draft Item

`PATCH /admin/package-plans/:planVersionId/items/:itemId` — requires
`packages.draft.manage`.

```json
{
  "expectedRevision": 4,
  "reason": "Close new activations after operational review.",
  "availability": "CLOSED_TO_NEW_ACTIVATIONS"
}
```

All mutable item terms are optional, but at least one must be supplied. To
change rate mode, the fixed/range fields must be supplied in a logically valid
combination. A stale `expectedRevision` returns HTTP 409.

### Publish a Plan Atomically

`POST /admin/package-plans/:planVersionId/publish` — SUPER_ADMIN only.

Publish now:

```json
{
  "expectedRevision": 5,
  "reason": "Founder reviewed and approved the complete plan."
}
```

Scheduled publication may additionally send ISO-8601 `effectiveFrom` and
optional `effectiveTo`. Backdating and overlapping ranges are rejected. When a
single currently effective open-ended predecessor exists, publication closes it
at the successor's `effectiveFrom` in the same serializable transaction and
audits both operations.

Publication fails unless the approved package contract is satisfied, including:

- USDT denomination;
- `USER_NET_AFTER_SPLIT` displayed rate meaning;
- `TOTAL_RETURN` plus `INCLUDED_IN_TOTAL_RETURN`;
- manual terminal-state renewal and no auto-renew action;
- upgrades disabled until dependent modules exist.

### Error Contract

- HTTP 400 — invalid DTO, decimals, durations, rates, timezone, effective range
  or non-publishable terms.
- HTTP 403 — missing permission or SUPER_ADMIN authority.
- HTTP 404 — plan, item or stable package definition not found.
- HTTP 409 — stale revision, immutable published terms, duplicate item values,
  overlapping plan ranges or concurrent serializable write conflict.

### Same-Origin Package BFF

Browser code never receives a NestJS bearer or refresh token. The Next.js
server forwards the existing HttpOnly-cookie session through these no-store
routes:

USER:

- `GET /api/user/packages` -> `GET /packages`

ADMIN/SUPER_ADMIN:

- `GET /api/admin/package-plans`
- `POST /api/admin/package-plans/drafts`
- `GET|PATCH /api/admin/package-plans/:planVersionId`
- `POST /api/admin/package-plans/:planVersionId/items`
- `PATCH /api/admin/package-plans/:planVersionId/items/:itemId`
- `POST /api/admin/package-plans/:planVersionId/publish`

The ADMIN `/packages` workspace resolves the shared browser session before any
dependent package request and enforces UI visibility for `packages.read` and
`packages.draft.manage`; NestJS remains authoritative. The USER
`/user/packages` route resolves the USER session first, renders the explicit
empty response before publication, and never renders a purchase/activation
control while `activationAvailable` is false.

The mandatory local runner is
`postman/FixTradeZone-PKG-01.postman_collection.json`. The v12-compatible MASTER
runner is
`postman/FixTradeZone-Local-API-MASTER-v13-PKG-01-FINAL-v2-ENV.postman_collection.json`;
acceptance instructions are in `docs/LOCAL-VERIFY-PACKAGES.md`.
