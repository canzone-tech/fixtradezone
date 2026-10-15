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

## V2 original acceptance requirements (implementation checkpoint and blockers below)
1. Generate **per-subscription, per-UTC-trading-day** daily gross NET P&L rate independently from package 0.70%-0.90% range (FTZ DynamoBot example); no fixed lifetime gross target or compounding.
2. Exactly configured 5 trade slots (or effective global activitiesPerDay); WIN/LOSS mix and order vary independently; at least one WIN. With one WIN, it must be last after four LOSS slots.
3. Every LOSS has negative trade P&L, wallet credit 0. WIN P&L positive; sum of signed WIN/LOSS trade P&Ls equals that day's generated gross NET P&L. No artificial 'TARGET CLOSE', no positive WIN with 'No additional credit' due to lifetime cap. UI must disclose internally generated activity.
4. The four obsolete policy fields (WIN weight, LOSS weight, WIN min/max, LOSS min/max — four groups/eight raw inputs) are removed from new policy UI and V2 generator. Old published versions remain immutable for historical audit.
5. Split final daily NET gross P&L using immutable subscription share snapshot (configured 70% USER / 30% ADMIN at activation); don't reinterpret historical USER-net rate promises retroactively.
6. Five due trade slots completed → persist immutable daily earnings claim with split amounts in **PENDING** status, no wallet posting. One authenticated claim transaction atomically transfers USER share into wallet ledger and ADMIN share, idempotently. No expiration in V1; claims survive completion and login gaps.
7. Existing funded ACTIVE/COMPLETED package ledgers and V1 rows must **not** be rewritten. Add versioned per-subscription model and migration with explicit cutover; same source event must not settle in legacy/canonical and V2.
8. Tests required before enabling V2: exactly 5 slots and sum-of-P&L at 8 decimal amount precision; min-one-WIN-last; no duplicated claims under concurrency; pending claim after package completes; split snapshot immutability; 0 wallet credit before claim; admin share and 3-ledger-entry balance after claim; client history reflects same canonical source; worker restart/resume and idempotent replay.

**Financial cutover uses the versioned V2 implementation below**. The first pagination commit alone did not contain these financial changes. Test the complete flow on the local browser and backend worker; never auto-deploy to main.


---

## V2 implementation checkpoint (2026-10-15)

**Code committed to the working branch. NOT YET VERIFIED or production-approved.**
V2 financial migration and all features require local build, database integration,
and direct-USER browser acceptance. Do NOT raise a PR to main until approved.

### Versioning / cutover
- V1 existing ACTIVE/COMPLETED subscriptions remain V1; immutable trade/ledger rows are untouched.
- After local migrations `0049_internal_trading_v2_daily_claims` and
  `0050_internal_trading_policy_financial_model`, the existing SUPER_ADMIN
  **Internal Trading Policy Draft -> Save -> Publish** workflow selects
  financialModelVersion V1 or V2. No new publishing endpoint/button.
- Existing published policies acquire **V1 by default**, without changing
  their published terms. A cloned draft starts with the source policy's model.
- Once a SUPER_ADMIN publishes an **enabled V2** policy, it becomes effective
  on the normal next safe trading-day boundary. Only newly activated eligible
  subscriptions that snapshot that effective policy become V2; old ACTIVE
  and COMPLETED subscriptions retain their original V1 state.
- `FTZ_INTERNAL_TRADING_V2_ENABLED=true` is a second **safety gate**, not
  the engine selector: turning it on while a V1 policy remains published
  does not activate V2. Turning it OFF when a V2 policy is effective blocks
  NEW V2 activations rather than silently creating V1 financial terms.
- Default V2 switch is OFF. Do not enable in production without review.
- Existing V1 target/reconciliation and published policy columns remain for
  historical processing; only new V2 trading ignores legacy WIN/LOSS weights/ranges.
- The effective canonical `simulated_activity_policy_versions` policy must have
  exactly five slots and timezone equal to subscription's trading timezone.
- Daily gross rate interpretation is **net-of-loss BEFORE the published policy USER/ADMIN split** for V2.
  Legacy packages tagged `USER_NET_AFTER_SPLIT` have a different commercial
  interpretation: review published package disclosures and secure business/legal
  sign-off before enabling V2 outside QA.

### V2 processing boundaries
1. The algorithm picks daily signed NET gross rate per subscription/day from immutable
   FIXED or RANDOM_RANGE package values, and independently allocates exactly 5
   WIN/LOSS percent results summing to that rate (six-percent-decimal precision).
   Four LOSS then one WIN is enforced if a day has only one WIN. Fixed technical
   loss magnitudes constrain internal simulation so the day can reconcile.
2. Simulated Activity records each scheduled canonical event; V2 financial
   reconciliation records its signed 8-decimal amount with settlementMode
   `CLAIM_PENDING`, **zero ledger posting per trade**.
3. After all five events, signed gross trading profit is split with activated
   USER/ADMIN share snapshot, and one immutable daily claim is stored in PENDING.
4. `POST /internal-trading/me/claims/:claimId/claim` acquires a claim row lock;
   only the authenticated actual USER may claim (administrator impersonation is
   blocked). Transactional balanced ledger posting credits USER PACKAGE_EARNINGS
   and SYSTEM ADMIN profit only once, with a unique ledger sourceKey.
5. No expiration: PENDING survives package completion. The principal return
   lifecycle remains separate.
6. The user Trading page lists daily claim cards/status and one Claim Profit action.
   The Wallet page shows the posted ledger only after claiming.

### LOCAL acceptance order: UI first (no Postman required)

**Do not run migrations against a production database or with unknown DATABASE_URL.**
The untracked `backups/` directory should not be removed; consider a separate
database backup before any migration.

1. Fetch branch from the local Git remote `prashant` and verify checkout.
   Run backend `npm run build`, frontend `npm run typecheck` and `npm run build`.
   Also run `npm test -- --runInBand` locally before approving finance changes.
2. Stop both local app processes. Verify the backend `DATABASE_URL` points
   to a disposable local QA database; then `cd backend && npm run db:status`,
   review migration 0050, and `npm run db:deploy` once approved.
3. Restart the backend with `FTZ_INTERNAL_TRADING_V2_ENABLED=true`
   **only in local QA**. From the existing SUPER_ADMIN Internal Trading screen,
   Create Draft -> select V2 -> Save Draft -> Publish for Next Trading Day.
   Confirm the published Daily Trades policy has exactly five activities/day
   and the same platform timezone. A published V2 policy will not take effect
   until the normal future effective trading-day boundary.
4. Create a NEW funded local QA INTERNAL_TRADING subscription **after V2 policy becomes effective**.
   Existing historical V1 subscriptions remain V1. Use packages whose displayed
   daily percentage range is intended to mean gross NET trading P&L.
5. Browser direct QA USER session: `/user/trading` and `/user/trade-activity`.
   Each day exactly 5 canonical trades in chronological slots; WIN > 0, LOSS < 0.
   Sum signed trade P&L to a daily result within published package range.
   The fifth trade must finish before a pending claim exists.
6. Before clicking Claim Profit inspect `/user/wallet`: PACKAGE_EARNINGS
   and Total Wallet must remain unchanged by new V2 trades.
7. After five slots become due, direct USER clicks Claim Profit:
   exactly one PACKAGE_EARNINGS wallet posting and split reflected in state,
   status changes to Claimed. Reload/retry/duplicate submissions must not credit
   twice. ADMIN impersonation can read claims but cannot click the button.
8. Check delayed login/unclaimed days and claims after package completion; wallet
   credit only after each claim, no expiry. Verify principal completion/return
   independently and preserve V1 existing completed subscription histories.
9. Explicitly test worker restarts, mixed V1/V2 packages, and concurrency before
   declaring this financially sensitive feature ready.

### Blockers before production
- Full local migrations, local UI, worker, concurrency and financial regression
  tests have NOT been run by the assistant. Do not interpret commits as passing.
- The older Simulated Activity worker only generates from the effective *current*
  policy/day. Long multi-day outages may leave historical V2 canonical days
  ungenerated. Implement and test safe backfill/recovery before production rollout.
- The package rate label/meaning must be aligned with V2 gross-before-split
  economics before any user-facing activation.
- Do not auto-convert existing V1 subscribed assets to V2. Require a separate
  migration plan and user approval if ever requested.

### SUPER_ADMIN published model checklist (0050)
- Existing policy versioning, Publish endpoint, auth guard, revision checks, audit
  logs and effective-date scheduling remain authoritative.
- V2 drafts require `activitiesPerDay=5`. Publish checks the effective
  simulated activity policy for **enabled**, **five canonical slots** and a
  **matching timezone**; misconfiguration fails closed.
- V1 drafts/policies retain historical slot allowances and legacy settlement.
- A failed V2 activation due to the backend gate or unsupported package reward
  mode must roll back the package activation transaction; no V1 fallback.
- Existing 0049 migration was already applied locally before 0050 was authored.
  Apply 0050 separately on local QA after code/build review; never on production.
