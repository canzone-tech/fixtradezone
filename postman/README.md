# FixTradeZone Postman Verification

Import the required collection JSON plus `FixTradeZone.local.postman_environment.json` and select **FixTradeZone Local**.

Login/Refresh collections automatically update their token variables where documented. No exported environment file may contain real credentials or tokens.

## PKG-01 Packages / Plan Foundation

`FixTradeZone-PKG-01.postman_collection.json` and the accepted MASTER v13 runner cover migration `0007_package_plan_foundation` and PKG-01 package publication/draft behavior.

PKG-01 has already passed its local API, SQL, UI and milestone gate. Do not blindly replay historical write requests such as package publication against an already-accepted database.

## DEP-01 Combined Acceptance

Use:

`FixTradeZone-DEP-01-COMBINED-ACCEPTANCE.postman_collection.json`

This runner is intentionally used **after the complete backend + frontend DEP-01 vertical slice is pulled locally**, not as an intermediate development checkpoint.

The receiving-account foundation is network-aware after `0009_deposit_network_generalization`, but the current deterministic DEP-01 acceptance lane deliberately remains **USDT / TRC20**. Other supported networks are validated by focused automated tests and can receive dedicated acceptance packs when their product flow is enabled.

Prerequisites:

1. local code gate is GREEN;
2. migrations `0008_deposit_foundation` and `0009_deposit_network_generalization` are explicitly deployed after a read-only migration-status check;
3. a real public USDT TRC20 receiving account and matching QR have been created in Admin `/deposits` and left ACTIVE;
4. for this QA run, avoid other ACTIVE USDT networks so random server assignment remains deterministically TRC20;
5. `adminIdentifier` / `adminPassword` point to a SUPER_ADMIN or delegated ADMIN with deposit permissions;
6. `userIdentifier` / `userPassword` point to an ACTIVE ordinary USER;
7. CAPTCHA is configured consistently with the local login test environment.

The runner performs LOCAL QA writes:

- verifies an active USDT/TRC20 account exists;
- logs in as USER;
- reads the effective published package catalogue;
- creates a deposit request;
- proves the one-open-deposit guard;
- proves invalid TRC20 transaction-ID rejection;
- submits a synthetic local QA transaction ID;
- verifies ADMIN pending review visibility;
- approves the first QA deposit;
- creates a second QA deposit;
- submits a second synthetic transaction ID;
- rejects the second QA deposit;
- verifies USER history contains both reviewed outcomes.

Synthetic transaction IDs in this collection are local test data only. DEP-01 does not perform blockchain credit, wallet balance changes or package activation. Never run this collection against production.
