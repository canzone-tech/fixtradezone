# FixTradeZone Postman Verification

Import both JSON files and select **FixTradeZone Local**.

1. Review, back up, and apply `0002_auth_sessions` locally with `prisma migrate deploy`.
2. Set `testEmail` and a unique local-only `testPassword` of 12–128 characters.
3. Run Health, then Register founder.
4. Run `npm run admin:bootstrap -- <testEmail>` from `backend/`.
5. Run Login, Current user, Refresh and rotate, Current user again, Logout, then Refresh after logout is rejected.
6. The Security checks request intentionally reuses the pre-rotation refresh token. It revokes all active sessions, so run it last and sign in again afterward.

Login and Refresh automatically update the environment access/refresh tokens. No exported environment file may contain real credentials or tokens.

## PKG-01 Packages / Plan Foundation

`FixTradeZone-PKG-01.postman_collection.json` is the focused backend acceptance
runner for migration `0007_package_plan_foundation`.

Before running it:
1. complete `npm run db:deploy` and `npm run verify:milestone` locally;
2. sign in as SUPER_ADMIN through the current MASTER collection so the local
   environment has a fresh `accessToken`;
3. follow `docs/LOCAL-VERIFY-PACKAGES.md` exactly;
4. run the 13 PKG-01 requests once, in order.

The package runner performs intentional local database writes, including V1
publication and V2 draft cloning. Do not run it against staging/production or
blindly rerun it after publication.
