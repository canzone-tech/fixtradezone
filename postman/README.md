# FixTradeZone Postman Verification

Import the required collection JSON plus `FixTradeZone.local.postman_environment.json` and select **FixTradeZone Local**.

Login/Refresh collections automatically update token variables where documented. No exported environment file may contain real credentials or tokens.

## PKG-01 Packages / Plan Foundation

`FixTradeZone-PKG-01.postman_collection.json` and the accepted MASTER v13 runner cover migration `0007_package_plan_foundation` and PKG-01 package publication/draft behavior.

PKG-01 has already passed local API, SQL, UI and milestone gates. Do not blindly replay historical package-publication writes against the accepted database.

## DEP-01 Combined Acceptance

Use:

`FixTradeZone-DEP-01-COMBINED-ACCEPTANCE.postman_collection.json`

Run it only after the complete backend + frontend vertical slice is locally green.

### Prerequisites

1. `npm run verify:local` is GREEN.
2. `0008_deposit_foundation` is applied.
3. `0009_deposit_network_generalization` is applied only after the green code gate.
4. Admin `/deposits` shows the seeded ACTIVE payment rail `USDT on TRON (TRC20)`.
5. That rail has at least one real public ACTIVE receiving account with a matching QR.
6. `adminIdentifier` / `adminPassword` point to SUPER_ADMIN or delegated ADMIN with deposit permissions.
7. `userIdentifier` / `userPassword` point to an ACTIVE ordinary USER.
8. CAPTCHA configuration matches the local login test environment.

The runner discovers `depositPaymentRailId` from the active account preflight; do not hardcode a rail UUID in Postman.

### What the runner proves

- Admin authentication.
- Active USDT/TRC20 payment rail + account preflight.
- USER authentication.
- Effective published package catalogue.
- Deposit creation using `packagePlanItemId + paymentRailId`.
- One-open-deposit HTTP 409 guard.
- Invalid network transaction-ID HTTP 400 guard.
- Valid local synthetic transaction submission.
- ADMIN pending-review visibility.
- APPROVED lifecycle + USER readback.
- Second deposit lifecycle ending REJECTED.
- Final USER history contains both terminal outcomes.

The current deterministic acceptance lane uses USDT/TRC20/TRON. That is test data, not a platform-wide network hardcode.

Synthetic transaction IDs are local QA data only. DEP-01 does not perform blockchain credit, wallet balance changes or package activation. Never run this collection against production.

## COMM-02 Expanded Referral Commissions

Use:

`FixTradeZone-COMM-02-REFERRAL-EXPANSION.postman_collection.json`

This focused collection covers the approved expansion of the existing Referral Commissions engine. It is **not** a separate Level Income module.

### COMM-02 prerequisites and order

1. Repository Backend + Admin CI are GREEN.
2. Pull the accepted feature-branch HEAD locally.
3. Apply forward migration `0033_referral_commission_level_depth` with `prisma migrate deploy`; never use `prisma migrate dev` or reset the database.
4. Complete SUPER_ADMIN frontend acceptance on `/commissions` first.
5. Only then use this Postman collection.
6. `adminAccessToken` must be a current SUPER_ADMIN/delegated admin token from the normal local login flow.

Requests `03`, `04`, and `06` are explicitly marked **MANUAL WRITE**. Do not blindly run the full collection. Request `06` publishes a new effective commission plan and must only be used after frontend approval.

### Approved COMM-02 policy reference

- L1: 10%
- L2: 4%
- L3: 3%
- L4: 2%
- L5: 1%
- L6-L10: 0.5%
- L11-L20: 1%
- L21-L30: 1.5%
- L31-L40: 2%
- L41-L50: 3%

Package depth is cumulative and based on the receiver's highest qualifying ACTIVE package. The reference mapping is CryptoBot L5, DynamoBot L5, EliteBot L10, JupiterBot L20, LegendBot L30, NovaBot L40, and PrimeBot L50 when that package exists in the published catalogue.

Package matching remains `min(upline package basis, downline source package value)`. A source package activation is processed once, sponsor routing is snapshotted at source activation time, publication is forward-only, old commission events remain immutable, and manual reconciliation is recovery-only.
