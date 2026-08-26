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
- Explicit status enums where lifecycle integrity matters
- Password hashes only; no plaintext password
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
Versioned package catalogue, definitions, plan versions/items and exact decimal economics. PKG-01 local acceptance is GREEN.

### `0008_deposit_foundation`
Applied locally on 2026-08-26 after resolving the MySQL-compatible open-key CHECK design. This migration is now immutable history.

It introduced:

- `deposit_accounts`;
- `deposits`;
- one-open-deposit key;
- package/payment/account snapshots;
- manual payment review states;
- deposit RBAC permissions.

The original migration established the current USDT/TRC20 launch lane. Its applied file must never be rewritten to generalize later behavior.

## Deposit Network Generalization — Migration `0009_deposit_network_generalization`

Status: **SOURCE IMPLEMENTED / LOCAL CODE + MIGRATION ACCEPTANCE PENDING**.

This forward-only migration removes the global USDT/TRC20 database restriction while retaining the current USDT/TRC20 QA lane.

### `deposit_accounts`

After `0009`, each receiving account keeps:

- immutable asset/token code;
- immutable network;
- immutable public address;
- QR snapshot/configuration;
- active state and revision;
- actor/timestamps.

Uniqueness becomes:

```text
(asset, network, walletAddress)
```

An index on `(asset, network, isActive)` supports authoritative receiving-pool lookup.

The `0008` CHECK constraints that fixed every account to USDT/TRC20 are removed by `0009`.

No private key, seed phrase, signing key or custody secret is stored.

### `deposits`

The immutable deposit snapshot continues to record:

- package/version/item identity;
- exact `DECIMAL(20,8)` amount;
- package currency;
- assigned receiving account;
- assigned network/address/QR;
- transaction identifier and review history.

`0009` expands `txid` from `CHAR(64)` to `VARCHAR(191)` so network-specific transaction identifiers can be stored.

Transaction uniqueness becomes:

```text
(assignedNetwork, txid)
```

This preserves duplicate protection without assuming every network uses one global 64-hex namespace.

### Validation authority

The database stores the selected network; application validation enforces address/transaction format according to that network.

Current supported registry:

```text
TRC20
ERC20
BEP20
POLYGON
ARBITRUM
BASE
OPTIMISM
SOLANA
```

Current application rules:

- TRC20 public address: TRON Base58Check with checksum validation;
- EVM public address: `0x` + 40 hexadecimal characters;
- SOLANA public address: Base58 structural validation;
- TRC20 transaction ID: 64 hex;
- EVM transaction hash: 64 hex with optional `0x` prefix;
- SOLANA transaction signature: Base58 structural validation.

Unknown networks are rejected until their validator is deliberately added.

### One-open-deposit DB guard

`openKey` remains nullable and unique.

Open states require non-null `openKey`; service writes `openKey = userId`. Terminal review releases it to `NULL`. This preserves one-open-deposit-per-user under concurrent requests.

### Financial/history rules unchanged

Deposit ownership, package references and assigned receiving account use restrictive history-preserving foreign keys. Review facts remain auditable.

DEP-01 still does **not** create:

- wallet balance;
- accounting ledger credit;
- package subscription/activation;
- referral commission;
- reward/cap consumption;
- withdrawal/payout;
- blockchain custody/signing state.

Later Wallet/Ledger and package-activation milestones must consume approved-deposit facts idempotently.

## Local migration rule

Before any new migration is deployed locally:

1. run the repository code gate;
2. run read-only `npm run db:status`;
3. inspect the exact pending migration;
4. apply only with explicit `npm run db:deploy`;
5. rerun migration status and module SQL/audit acceptance;
6. never rewrite an already-applied migration;
7. never reset the real application database merely to bypass a failed migration.

Current local database has `0008` applied. `0009` must remain pending until the generalized code gate is GREEN.

Production migration status is unknown and production deployment remains on HOLD.
