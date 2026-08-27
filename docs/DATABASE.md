# FixTradeZone — Database Standards & Current State

## Single Application Database

- Host: 127.0.0.1
- Port: 3306
- Database: `fixtradezone`
- MySQL: 8.0.46
- Runtime user: `fixtradezone`

Do not create additional application databases unless explicitly approved.

## Prisma

- Prisma: 7.9.1
- Generator: `prisma-client`
- Output: `src/generated/prisma`
- moduleFormat: `cjs`
- Datasource provider: MySQL
- URL configured via `prisma.config.ts`
- Runtime connectivity uses `@prisma/adapter-mariadb`

## Database Conventions

- UUID IDs: `CHAR(36)`
- UTC timestamps
- `createdAt` + `updatedAt` where mutable state exists
- Financial values: SQL `DECIMAL`; never FLOAT/DOUBLE
- Explicit lifecycle enums where integrity matters
- Secrets remain in env/secret management, never business tables
- Important admin/financial actions are audited
- Historical financial/business facts are not silently rewritten or deleted
- Reversals/adjustments are separate linked events in later accounting modules
- Migration application is explicit; do not use `prisma migrate dev` without shadow-DB approval

## Applied Migration History

### `0001_foundation_auth_rbac`
Foundation users/RBAC/audit schema.

### `0002_auth_sessions` through `0004`
Authentication session and security/impersonation foundation.

### `0005_configurable_auth_registration`
Configurable identifiers/auth/registration and system sequence foundation.

### `0006_referral_foundation`
Relational referral profiles, sponsor history and referral configuration.

### `0007_package_plan_foundation`
Versioned package catalogue and exact decimal economics. PKG-01 local acceptance is GREEN.

### `0008_deposit_foundation`
Applied locally on 2026-08-26 after correcting the MySQL-compatible open-key CHECK. It is immutable migration history.

It introduced:

- `deposit_accounts`;
- `deposits`;
- one-open-deposit key;
- package/payment/account snapshots;
- manual payment review states;
- deposit RBAC permissions.

The applied 0008 file must never be rewritten.

## Pending Migration — `0009_deposit_network_generalization`

Status: **SOURCE IMPLEMENTED AS DATA-DRIVEN PAYMENT-RAIL HARDENING / LOCAL CODE GATE PENDING**.

Read-only local migration status has already confirmed 9 migrations with only `0009` pending. Do not deploy it until the revised code gate is GREEN.

### `deposit_payment_rails`

`0009` creates first-class payment-route configuration:

```text
id
asset
networkCode
displayName
validationProfile
isActive
revision
createdByUserId
updatedByUserId
createdAt
updatedAt
```

Integrity:

- unique `(asset, networkCode)`;
- asset/network-code shape checks;
- positive revision;
- actor FKs preserve auditability;
- protocol profile is typed as `TRON`, `EVM`, or `SOLANA`.

A deterministic V1 rail is seeded:

```text
id                = 00000000-0000-4000-8000-000000000901
asset             = USDT
networkCode       = TRC20
displayName       = USDT on TRON (TRC20)
validationProfile = TRON
```

This is launch configuration, not a global schema restriction.

### `deposit_accounts` after 0009

A receiving account references a configured rail with mandatory `paymentRailId`.

Existing 0008 USDT/TRC20 rows are backfilled to the deterministic seeded rail before the FK becomes NOT NULL.

The existing `asset` and `network` columns remain immutable assignment snapshots populated from the selected rail. They are not freehand Admin input.

Uniqueness becomes:

```text
(paymentRailId, walletAddress)
```

Lookup index:

```text
(paymentRailId, isActive)
```

The old 0008 checks forcing every account to USDT/TRC20 are removed.

No private key, seed phrase, signing key or custody secret is stored.

### `deposits` after 0009

The deposit fact keeps exact `DECIMAL(20,8)` amount and immutable assignment snapshots.

`0009` adds:

```text
assignedValidationProfile
```

Existing TRC20 deposits are backfilled as `TRON` before this field becomes NOT NULL.

Transaction storage expands from `CHAR(64)` to `VARCHAR(191)` for protocol-specific identifiers.

Transaction uniqueness becomes:

```text
(assignedNetwork, txid)
```

Validation uses the immutable `assignedValidationProfile` snapshot. A later Admin rail change therefore cannot reinterpret a historical deposit.

### Network and validator ownership

Network names are **data**, stored in `deposit_payment_rails.networkCode`; they are not a hardcoded application list.

Protocol validator families remain code because address and transaction validation is security-sensitive:

- `TRON`: Base58Check public address + 64-hex transaction ID;
- `EVM`: 20-byte `0x` address + 32-byte transaction hash;
- `SOLANA`: Base58 structural public key/signature validation.

A new network using an existing protocol profile can be configured as data. A genuinely new protocol family requires reviewed validator code before activation.

### Payment routing rule

A package determines authoritative `amount + currency`.

The USER chooses an ACTIVE payment rail whose `asset` matches that currency. The backend then randomly assigns an ACTIVE receiving account **within that exact rail**.

This prevents random cross-network assignment and wrong-chain ambiguity.

### One-open-deposit guard

`openKey` remains nullable and unique.

Open states require non-null `openKey`; service writes `openKey = userId`. Terminal review releases it to `NULL`.

### Deferred accounting

DEP-01 still does **not** create:

- wallet balance;
- accounting ledger credit;
- package subscription/activation;
- referral commission;
- reward/cap consumption;
- withdrawal/payout;
- blockchain custody/signing state.

Later modules must consume approved deposit facts idempotently.

## Local Migration Rule

1. Run repository code gate.
2. Run read-only `npm run db:status`.
3. Inspect exact pending migration.
4. Apply only with explicit `npm run db:deploy` after code gate GREEN.
5. Rerun migration status and module SQL/audit acceptance.
6. Never rewrite an already-applied migration.
7. Never reset the real application database merely to bypass a failed migration.

Current local DB: `0008` applied; `0009` pending.

Production migration status is unknown and production deployment remains HOLD.
