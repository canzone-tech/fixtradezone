# PWA WIN/LOSS Web Push — local QA only (Phase 2)

Current status: **implementation draft; local QA is pending**. Do not merge this branch or deploy to production until explicitly verified. Phase 1 (V1/V2 committed trade event → in-app FINANCE notification) was visually verified for 18 Oct 2026 on local MD TAJ, with 5 V1 + 5 V2 trades.

## Design boundaries

- WIN/LOSS notifications are generated **only from newly committed canonical Internal Trading trade events** (V1 and V2), one inbox item per created event.
- The Web Push dispatcher consumes persisted `user_notifications` with `sourceType='INTERNAL_TRADE_EVENT'`, and sends to **explicitly opted-in** browser endpoints. Subscriptions are not backfilled with old inbox history.
- `user_web_push_subscriptions` and `user_notification_push_deliveries` are durable delivery records (migration 0051), with retries and provider 404/410 cleanup. Redis prevents concurrent dispatcher instances.
- Push event payload contains recipient ID so the PWA service worker checks the current authenticated USER session before showing account-specific content on shared browsers. If the session is absent, delivery does not show a notification. Push delivery is best-effort; the inbox remains authoritative.
- WIN/LOSS alerts do **not** modify Internal Trading balances, V1 posting, V2 daily claims, or wallet accounting.
- Firebase console/account and FCM client SDK are **not** needed. The browser may use FCM/Apple/Firefox delivery infrastructure under standard Web Push.

## Local preparation

1. Stop any `faketime` NestJS instance with Ctrl+C. Check `date` / `date -u`; do not modify machine or database clocks. Confirm `backend/.env` points to **local** MySQL and Redis, never production.
2. On `feat/win-loss-user-notification-events`, pull latest branch from `prashant`.
3. Install one runtime and one development dependency in the backend workspace, updating **both** `backend/package.json` and `backend/package-lock.json`:
   ```bash
   cd ~/FixTradeZone/backend
   npm install --save-exact web-push@3.6.7
   npm install --save-dev --save-exact @types/web-push@3.6.4
   ```
4. Format new/edited backend TS (do not mass-reformat unrelated files):
   ```bash
   npx prettier --write src/config/env.validation.ts src/notifications/notifications.module.ts src/notifications/trade-web-push.controller.ts src/notifications/trade-web-push.service.ts src/notifications/trade-web-push.service.spec.ts src/notifications/dto/web-push-subscription.dto.ts
   npm run format:check
   npm run lint
   npm test -- --runInBand
   npm run build
   ```
5. Format/check the Next.js changed files:
   ```bash
   cd ~/FixTradeZone/admin
   ../backend/node_modules/.bin/prettier --write src/components/pwa/trade-push-controls.tsx src/app/api/user/notifications/push/route.ts src/app/user/notifications/user-notifications-client.tsx
   npm run lint
   npm run typecheck
   npm run build
   ```
6. Confirm **local DB credentials**. Only against the local DB:
   ```bash
   cd ~/FixTradeZone/backend
   npx prisma migrate deploy
   npx prisma migrate status
   ```
   Migration 0051 is forward-only. No existing trade/claim/ledger record is rewritten.
7. Generate local VAPID keys **on your machine**, never paste the private key into chats or GitHub:
   ```bash
   node -e "console.log(require('web-push').generateVAPIDKeys())"
   ```
   Add to the gitignored local `backend/.env`:
   ```env
   WEB_PUSH_ENABLED=true
   WEB_PUSH_VAPID_PUBLIC_KEY=<public-key>
   WEB_PUSH_VAPID_PRIVATE_KEY=<private-key>
   WEB_PUSH_VAPID_SUBJECT=mailto:<your-valid-sender-email>
   WEB_PUSH_WORKER_INTERVAL_MS=30000
   ```
   Key pairs must match. `WEB_PUSH_VAPID_PRIVATE_KEY` is backend-only; it must **not** be placed in Next.js environment or source files.

## Local user acceptance (Postman optional)

1. Start NestJS with **normal clock**, then Next.js. Browse `http://localhost:3001/user/notifications` (localhost is a trustworthy origin).
2. Press **Enable on this device** and grant browser notifications. The UI should confirm registration. Check subscription endpoint belongs to a supported push provider. iOS Web Push requires an installed Home Screen PWA on compatible versions.
3. With a local V1/V2 package and **next due new trades**, run safe local QA as previously tested. The *new* WIN/LOSS inbox alerts should appear; OS/browser pop-up delivery should appear even while PWA is backgrounded or closed, depending on browser/OS permission and active USER session.
4. Verify WIN and LOSS each deep-link to `/user/trading`. Refresh the inbox and replay reconciliation with **no new event**, confirming it creates no duplicate inbox notification or new push delivery.
5. Press **Disable on this device**; new WIN/LOSS events should continue appearing **in-app** but not be sent to the disabled browser. Test re-enable and browser reload.
6. Confirm an absent, expired or different USER session does **not** display someone else's sensitive trade notifications. Validate permission denial shows a useful UI message.
7. Check the local subscription/delivery status if push isn't delivered; provider acceptance does not guarantee OS display.

Only after both backend and frontend checks + actual local browser/PWA push delivery are GREEN should this feature branch receive a PR to main. The compiled production artifact build must include the npm dependency lockfile changes. Do not use `git add .`: preserve `backups/` and `backend/@C9`.
