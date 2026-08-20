# Local Verification — Auth Session + Admin Shell

The development branch may be shared for local testing, but do not open a pull request, merge, or deploy until every required check below passes.

## 1. Backend automated checks

From `backend/` with the existing local `.env` configured:

```bash
npm ci
npm run prisma:generate
npm run lint
npm test -- --runInBand
npm run build
npm audit --audit-level=critical
```

The known Prisma `deepmerge-ts` high advisory remains documented. Do not run a forced audit fix or unreviewed override.

## 2. Review and apply the additive migration

Use the established database backup procedure first. Then review:

```bash
sed -n '1,240p' prisma/migrations/0002_auth_sessions/migration.sql
npx prisma migrate status
```

The migration may only create `auth_sessions`, its indexes, and its foreign key. After confirming the backup and SQL:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Never use `prisma migrate dev` for this project without explicit shadow-database approval.

## 3. Start the API and create the first administrator

```bash
npm run start:dev
```

Import the collection/environment under `postman/`, set a unique local-only `testEmail` and `testPassword`, run Health and Register founder, then from a second terminal run:

```bash
cd backend
npm run admin:bootstrap -- founder@example.com
```

Replace the example email with the exact Postman `testEmail`. The command must succeed once and refuse a second bootstrap attempt.

## 4. Postman verification

Run in this order:

1. Login — HTTP 200; access and refresh variables populated.
2. Current user — HTTP 200; ACTIVE user and ADMIN role returned.
3. Refresh and rotate — HTTP 200; both token variables replaced.
4. Current user — HTTP 200 with the replacement access token.
5. Logout — HTTP 200; token variables cleared.
6. Refresh after logout is rejected — HTTP 401.

Run the rotated-token reuse security request last. It must return HTTP 401 and revoke all active refresh sessions, so sign in again afterward.

## 5. Admin install and build

The reviewed lockfile is included:

```bash
cd admin
cp .env.example .env.local
npm ci
npm run lint
npm run build
npm run dev -- --port 3001
```

Keep `package-lock.json` unchanged. Open `http://localhost:3001` and verify:

- invalid credentials show a controlled error;
- the founder ADMIN account reaches the dashboard;
- browser JavaScript cannot read either auth token;
- deleting only the short-lived access cookie and reloading restores the session through refresh rotation;
- Sign out returns to Login and Dashboard no longer opens;
- no fake totals, balances, users, deposits, or trade results appear.

## 6. Read-only database verification

Confirm that refresh tokens are hashed and lifecycle events are audited:

```sql
SELECT id, userId, LEFT(refreshTokenHash, 12) AS hashPrefix,
       expiresAt, revokedAt, revocationReason, createdAt
FROM auth_sessions
ORDER BY createdAt DESC
LIMIT 10;

SELECT action, entityType, entityId, description, createdAt
FROM audit_logs
WHERE entityType IN ('AuthSession', 'User')
ORDER BY createdAt DESC
LIMIT 20;
```

No raw access or refresh token may appear in MySQL, logs, screenshots, exported Postman environments, commits, or review comments.
