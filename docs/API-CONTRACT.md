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
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout

## Planned Core Areas
Users, Admin, Packages, AI Agents, Deposits, Wallet/Ledger, Referrals, Commissions, Rewards, Simulated Trades, CMS.

## Postman
Postman is installed and configured. Health endpoint has been verified. Login should later automatically save accessToken and refreshToken to the Postman environment.
