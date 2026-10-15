# User history: first local test checkpoint

Working branch: `feat/daily-net-trading-claims-history-pagination`. Do not merge this branch before local frontend and Postman acceptance.

## Implemented in this checkpoint
- Backend `days=1|2|7|30` UTC-calendar-day filtering; `fromDate`/`toDate` inclusive, with mutual exclusion to `days`; page/limit remain bounded.
- Default frontend view **Last 2 UTC days**, 20 records/page; 10/20/50 page size; date range and All; previous/next controls.
- Trading, Daily Trades and Wallet each query paged records from backend. Legacy API without a date filter keeps complete history.
- No ledger/claims/trading financial settlement behavior changed in this checkpoint. Prior immutable financial events stay intact.
- Trading dashboard no longer displays the precomputed lifetime Gross Target. This is a display-only change until financial engine V2 is integrated.

## Local test order
1. Pull branch, install dependencies per repo README, ensure local backend/frontend can run with local DB and **do not connect production DB**.
2. Backend: `cd backend && npm run build` and `npm test -- --runInBand`.
3. Frontend: `cd admin && npm run build` plus check any repo lint scripts.
4. Browser: `/user/trading`, `/user/trade-activity`, `/user/wallet`. Verify Last 1 / 2 / 7 / 30 days, All and Custom dates, rows/page, pagination boundaries, choosing a different trading package, authenticated navigation and UTC labels. Confirm wallet balances do not change when filtering.
5. Postman: import `postman/FixTradeZone-USER-HISTORY-PAGINATION-LOCAL.postman_collection.json`, set `baseUrl`, `userIdentifier`, `userPassword`; run read-only calls with a local eligible package. Test empty/no-history account and a rich-history account separately.
6. Investigate SQL performance with EXPLAIN if large history: DATE() currently sacrifices date-index sargability. Add covering indexes/range predicates if necessary before production.

## Financial engine V2 — approved business rules but NOT YET IMPLEMENTED
1. Generate **per-subscription, per-UTC-trading-day** daily gross NET P&L rate independently from package 0.70%-0.90% range (FTZ DynamoBot example); no fixed lifetime gross target or compounding.
2. Exactly configured 5 trade slots (or effective global activitiesPerDay); WIN/LOSS mix and order vary independently; at least one WIN. With one WIN, it must be last after four LOSS slots.
3. Every LOSS has negative trade P&L, wallet credit 0. WIN P&L positive; sum of signed WIN/LOSS trade P&Ls equals that day's generated gross NET P&L. No artificial 'TARGET CLOSE', no positive WIN with 'No additional credit' due to lifetime cap. UI must disclose internally generated activity.
4. The four obsolete policy fields (WIN weight, LOSS weight, WIN min/max, LOSS min/max — four groups/eight raw inputs) are removed from new policy UI and V2 generator. Old published versions remain immutable for historical audit.
5. Split final daily NET gross P&L using immutable subscription share snapshot (configured 70% USER / 30% ADMIN at activation); don't reinterpret historical USER-net rate promises retroactively.
6. Five due trade slots completed → persist immutable daily earnings claim with split amounts in **PENDING** status, no wallet posting. One authenticated claim transaction atomically transfers USER share into wallet ledger and ADMIN share, idempotently. No expiration in V1; claims survive completion and login gaps.
7. Existing funded ACTIVE/COMPLETED package ledgers and V1 rows must **not** be rewritten. Add versioned per-subscription model and migration with explicit cutover; same source event must not settle in legacy/canonical and V2.
8. Tests required before enabling V2: exactly 5 slots and sum-of-P&L at 8 decimal amount precision; min-one-WIN-last; no duplicated claims under concurrency; pending claim after package completes; split snapshot immutability; 0 wallet credit before claim; admin share and 3-ledger-entry balance after claim; client history reflects same canonical source; worker restart/resume and idempotent replay.

**Financial cutover is a separate checkpoint**, not included in this initial pagination commit. Test API first on local Postman before implementing/enabling next module; never auto-deploy to main.
