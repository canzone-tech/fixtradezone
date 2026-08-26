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
