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

## Planned Auth Endpoints
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

The request DTO layer is implemented. The endpoint handlers remain pending.

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

### Login

```json
{
  "email": "user@example.com",
  "password": "submitted-password"
}
```

Email is normalized. Password must be a non-empty string no longer than 128 characters.

### Refresh and Logout

```json
{
  "refreshToken": "<refresh-token>"
}
```

The request value must be a JWT-shaped string no longer than 4096 characters. DTO validation checks structure only; the authentication service must verify signature, expiry, token type, rotation state, and revocation state.

## Planned Core Areas
Users, Admin, Packages, AI Agents, Deposits, Wallet/Ledger, Referrals, Commissions, Rewards, Simulated Trades, CMS.

## Postman
Postman is installed and configured. Health endpoint has been verified. Login should later automatically save `accessToken` and `refreshToken` to the Postman environment.
