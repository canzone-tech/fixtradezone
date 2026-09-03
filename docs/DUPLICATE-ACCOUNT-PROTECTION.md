# Duplicate Account Protection — Module 1B

Status: IMPLEMENTED ON FEATURE BRANCH; LOCAL UI ACCEPTANCE REQUIRED BEFORE MAIN PR.

## Locked rule

FixTradeZone applies the client rule **ONE PERSON = ONE ACCOUNT**.

The implementation deliberately treats signals by strength:

- email uniqueness remains a hard public-registration rule;
- the browser/PWA installation ID is the strong duplicate-risk signal;
- IP address is supporting context only and is never sufficient by itself to identify a person or block an account;
- future KYC/identity verification remains the strongest person-level confirmation;
- approximate location may be added later as supporting enrichment only. Exact GPS is not required and location is not an enforcement basis in this module.

Browser fingerprinting is not used as a hard identity basis. Installation IDs can change when browser/PWA storage is removed, the application is reinstalled, or the browser changes, so the installation ID is a strong signal rather than permanent identity proof.

## SUPERADMIN enforcement modes

Only SUPERADMIN can manage duplicate-account protection.

- `OFF` — no duplicate-device enforcement.
- `MONITOR` — registration is allowed and an immutable risk event is recorded.
- `RESTRICT` — duplicate-device registration is allowed, but the new account is created with `RESTRICTED` status. Email verification records email ownership but does not convert a restricted account to `ACTIVE`.
- `BLOCK` — duplicate-device registration is rejected and the blocked attempt is recorded.

Existing accounts are not retroactively restricted or blocked merely because a shared installation is observed after login. Such observations are recorded for review.

## Local/PWA installation identity

The web/PWA client creates and persists a UUID v4 installation ID using browser storage. The ID is submitted during public registration and observed again for authenticated user sessions so the backend can maintain user-to-installation mappings.

The server validates the installation ID and stores first/last-seen context. A single installation linked to another user is the duplicate-device signal used by the enforcement modes.

## Test and development bypass

SUPERADMIN can maintain exact allowlist entries for:

- `DEVICE_INSTALLATION_ID`
- `IP_ADDRESS`

Allowlist entries are intended for approved local/test environments. Configuration and allowlist changes are audited. An active exact match bypasses duplicate-account enforcement and the registration event is marked `BYPASSED`.

## Audit/readback

The module records duplicate-account risk events independently of wallet/ledger data. Events include the enforcement mode, action, attempted email where available, installation ID, IP context, matched user IDs and bypass information.

The SUPERADMIN settings UI shows recent immutable risk-event readback and allowlist configuration.

## Database

Forward-only migration:

`0022_duplicate_account_protection`

It adds the `RESTRICTED` user status plus duplicate-account configuration, device-installation mapping, allowlist and risk-event storage.

Apply locally only with:

```bash
cd backend
npx prisma migrate deploy
npx prisma migrate status
```

Do not use `prisma migrate dev` and do not reset the database.

## Local acceptance

Per the current project testing workflow, browser/UI acceptance is the default first functional check after local build gates. Postman is reserved for troubleshooting or focused API proof if UI behavior is unclear.

Local acceptance should confirm SUPERADMIN access, mode persistence, duplicate-device behavior for `MONITOR`, `RESTRICT` and `BLOCK`, allowlist bypass/remove, and recent risk-event readback. A PR to `main` must not be raised before local acceptance is GREEN.
