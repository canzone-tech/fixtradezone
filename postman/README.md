# FixTradeZone Postman Verification

Import both JSON files and select **FixTradeZone Local**.

1. Review, back up, and apply `0002_auth_sessions` locally with `prisma migrate deploy`.
2. Set `testEmail` and a unique local-only `testPassword` of 12–128 characters.
3. Run Health, then Register founder.
4. Run `npm run admin:bootstrap -- <testEmail>` from `backend/`.
5. Run Login, Current user, Refresh and rotate, Current user again, Logout, then Refresh after logout is rejected.
6. The Security checks request intentionally reuses the pre-rotation refresh token. It revokes all active sessions, so run it last and sign in again afterward.

Login and Refresh automatically update the environment access/refresh tokens. No exported environment file may contain real credentials or tokens.
