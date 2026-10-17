# PWA WIN/LOSS Web Push — local QA only (Phase 2)

Current status: **backend/frontend static checks were green locally before onboarding changes; installed-PWA onboarding and end-to-end trade-event push delivery still require fresh local QA**. Do not merge this branch or deploy to production until explicitly verified. Phase 1 (V1/V2 committed trade event → in-app FINANCE notification) was visually verified for 18 Oct 2026 on local MD TAJ, with 5 V1 + 5 V2 trades.

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

1. Start NestJS with **normal clock**, then Next.js. On desktop Chrome install the PWA (Chrome menu > Install page as app, or equivalent); on iOS use Add to Home Screen. Open the **installed app**, sign in as a normal USER (not admin impersonation).
2. After authenticated login, the installed PWA must show **Enable Daily Trade Alerts** if push permission is not yet granted. Tap **Enable Notifications**, then explicitly allow the browser/OS permission. Browsers cannot be forced to grant permission programmatically. If blocked/unavailable, there must be a safe recovery path without trapping users. `http://localhost:3001` is a trustworthy origin for local testing. **Notifications inbox must NOT show the old Enable/Disable controls.**
3. Reload the installed PWA and navigate between pages; a valid already-granted subscription must be silently synchronized without showing the onboarding again, clearing delivery records, or resending prior notifications. A regular browser tab (not standalone) must not show the login-gated PWA onboarding. iOS Web Push requires an installed Home Screen PWA on compatible versions.
4. With a local V1/V2 package and **next due new trades**, run safe local QA as previously tested. The *new* WIN/LOSS inbox alerts should appear; OS/browser pop-up delivery should appear even while PWA is backgrounded or closed, depending on browser/OS permission and active USER session.
5. Verify WIN and LOSS each deep-link to `/user/trading`. Refresh the inbox and replay reconciliation with **no new event**, confirming it creates no duplicate inbox notification or new push delivery.
6. Verify the same signed-in user can re-open the installed PWA without another prompt. Test blocked permission behavior and OS notification settings. A user should never lose access to their in-app inbox because an OS denied notifications.
7. Confirm an absent, expired or different USER session does **not** display someone else's sensitive trade notifications. Validate permission denial shows a useful UI message.
8. Check the local subscription/delivery status if push isn't delivered; provider acceptance does not guarantee OS display.

Only after both backend and frontend checks + actual local browser/PWA push delivery are GREEN should this feature branch receive a PR to main. The compiled production artifact build must include the npm dependency lockfile changes. Do not use `git add .`: preserve `backups/` and `backend/@C9`.

## Verified so far / caveats

- The local DB migration was confirmed applied (51 migrations), backend/Next.js checks were green before the post-login onboarding change, and an explicit Chrome standard Web Push test returned HTTP 201 and displayed a GNOME desktop notification.
- These checks **do not** prove the automatic worker sends a new V1/V2 trade alert or that the latest installed PWA onboarding passes. Re-run static checks and end-to-end acceptance after changes.
- Notifications use `requireInteraction: true`; GNOME/Chrome can still auto-hide heads-up popups. They cannot be made universally permanent by application code.
- Dependency updates from local `npm install` must be committed to `backend/package.json` and `backend/package-lock.json` along with formatted changes before any PR. Never commit local `.env` or VAPID private keys.
