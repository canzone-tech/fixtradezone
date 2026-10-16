# Daily Trade WIN/LOSS notification — local acceptance

**Scope (stage 1):** On creation of a **canonical Internal Trading event** (V1 or V2), create one FINANCE **in-app inbox** notification in the same database transaction. The title is `Daily Trade WIN` or `Daily Trade LOSS`. User-facing copy says **algorithm-generated Daily Trade** and never claims exchange execution. Notifications have `sourceType=INTERNAL_TRADE_EVENT` and `sourceId=<event id>`.

This checkpoint does **not** send device/browser push yet. Web Push subscriptions, VAPID delivery and service-worker handling are the next stage, after local event verification. Claim Profit Ready is also a subsequent stage.

## Local API and Postman acceptance

1. Fetch feature branch into a **local** workspace; never connect to production MySQL. Run `cd backend && npm run format:check && npm run lint && npm test -- --runInBand && npm run build`.
2. Start local NestJS and Next.js against local QA database. Log in as an ordinary test USER through the existing auth flow; use the access token in Postman where required.
3. With an existing valid local V1 subscription and due Daily Trade, allow the existing canonical worker/reconciliation to complete one WIN or LOSS. In Postman, call `GET {{baseUrl}}/notifications?limit=100`. Confirm **one** FINANCE alert for the new Internal Trading event, correct WIN/LOSS and asset, and distinct `sourceId`.
4. Repeat the reconciliation/worker cycle without creating a new canonical trade. Confirm no additional notification for the already-created event. Check `GET {{baseUrl}}/notifications?unreadOnly=true&limit=100` and `PATCH {{baseUrl}}/notifications/{{notificationId}}/read`.
5. Repeat with a **local V2** subscription and due trade; confirm the same alerts. V2 trade alerts **do not credit the wallet**; claims remain separate.
6. Test rollback/error and workers restarted/replayed locally. A transaction failure must leave neither a new event nor its inbox notification.
7. In the local PWA user portal, visit `/user/notifications` to see the alerts. No browser notification permission is needed for this **inbox stage**.
8. Only after backend/local Postman acceptance is GREEN, begin stage 2 (Web Push + VAPID + service worker); only then run Android/iPhone notification tests.

**Production unchanged; do not merge or deploy until both stages receive QA approval.**
