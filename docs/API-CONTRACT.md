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
- `POST /auth/login` — implemented on feature branch; local verification pending
- `POST /auth/refresh` — implemented on feature branch; local verification pending
- `POST /auth/logout` — implemented on feature branch; local verification pending
- `GET /auth/me` — implemented on feature branch; local verification pending

The request DTO layer is implemented for the planned authentication lifecycle.

## Auth Request Validation

All DTO-backed request bodies reject unknown fields.

### Register

```json
{
  "email": "user@example.com",
  "password": "a-password-of-at-least-12-characters",
  "username": "trader.one",
  "phone": "+919876543210",
  "firstName": "Prashant",
  "lastName": "Shukla"
}
```

| Field | Required | Validation |
|---|---:|---|
| `email` | Yes | Valid email, maximum 191 characters; trimmed and lowercased |
| `password` | Yes | String, 12–128 characters; never trimmed or normalized |
| `username` | No | 3–30 characters; lowercase letters, numbers, period, underscore, or hyphen |
| `phone` | No | E.164 format |
| `firstName` | No | Trimmed string, 1–100 characters |
| `lastName` | No | Trimmed string, 1–100 characters |

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
    "phone": "+919876543210",
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
    "phone": "+919876543210",
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

## Planned Core Areas
Users, Admin, Packages, AI Agents, Deposits, Wallet/Ledger, Referrals, Commissions, Rewards, Simulated Trades, CMS.

## Postman
Postman is installed and configured. Health and Register are verified. During local feature validation, Login must save `accessToken` and `refreshToken`, Refresh must replace both variables, the previous refresh token must fail, Me must work with the new access token, and Logout must make the latest refresh token unusable.
