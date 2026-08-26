# FixTradeZone — DEP-01 Deposit Foundation

**Status:** LOCKED IMPLEMENTATION CONTRACT — NETWORK-AWARE HARDENING PENDING LOCAL ACCEPTANCE  
**Scope:** DEP-01A receiving-account management + DEP-01B deposit request/transaction-ID/manual review  
**Current acceptance lane:** USDT on TRON / TRC20  
**Foundation rule:** receiving accounts are asset + network aware; TRC20 is not a global platform constraint.

## 1. Purpose

DEP-01 creates the launch-critical manual deposit workflow without introducing a wallet ledger, package activation, automated blockchain verification, private-key custody or trading behavior.

The accepted flow is:

```text
USER selects an available package
→ backend validates the currently effective published package item
→ backend derives the authoritative package amount + currency
→ backend randomly assigns one ACTIVE receiving account whose asset matches that currency
→ USER receives exact amount + assigned network + public address + QR image
→ USER pays externally
→ USER submits the transaction identifier for the assigned network
→ deposit becomes PENDING_REVIEW
→ authorized ADMIN/SUPER_ADMIN manually APPROVES or REJECTS
→ approval is recorded as an immutable reviewed payment fact
→ ledger credit/package activation remain deferred to later milestones
```

The current local/Postman acceptance lane remains USDT/TRC20. That does not make TRC20 a global schema or UI rule.

## 2. Non-negotiable integrity rules

- Backend is authoritative for package, amount, account assignment, assigned network and status transitions.
- USER never chooses or overrides a receiving account or network after a deposit request is created.
- Assignment is random across currently ACTIVE receiving accounts matching the package currency/asset.
- Only public receiving addresses and QR images are stored. **No private key, seed phrase, signing key or wallet secret may be stored.**
- Receiving-account asset, network and address are immutable after creation. To replace any of them, disable the old account and create another account.
- Historical deposits preserve an assignment snapshot even if the receiving account is later renamed, QR-updated or disabled.
- Address validation is selected by network, never by one global hardcoded format.
- Transaction-identifier validation is selected by the deposit's assigned network.
- Transaction identifiers are unique within their assigned network.
- Money uses exact SQL `DECIMAL`; never JavaScript floating point for authoritative values.
- Financial/admin transitions are auditable.
- Approval/rejection is state-safe: only `PENDING_REVIEW` may transition to `APPROVED` or `REJECTED`.
- Approval does **not** create balance, ledger, earnings, commission or package activation in DEP-01.
- Rejected deposits are terminal for DEP-01; the USER creates a new deposit request for another payment attempt.
- No automatic blockchain/RPC/explorer verification in DEP-01. Manual review is the v1 authority.
- All API responses containing deposit/account state use `Cache-Control: no-store`.

## 3. Receiving-account model

Each receiving account stores:

- immutable UUID
- operator label
- immutable asset/token code, normalized uppercase
- immutable supported network
- immutable public receiving address validated for that network
- QR image data URL (`image/png`, `image/jpeg`, `image/webp` or `image/svg+xml`), maximum 256 KiB client file size
- active/inactive state
- optimistic `revision`
- created/updated actor and timestamps

Account identity/uniqueness is:

```text
asset + network + walletAddress
```

This intentionally permits the same underlying public wallet address to be configured for different assets where operationally valid, while preventing duplicate rows for the same asset/network/address tuple.

Supported network registry in the current foundation:

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

Network validation rules currently include:

- TRC20: TRON Base58Check mainnet address including checksum validation.
- EVM networks (`ERC20`, `BEP20`, `POLYGON`, `ARBITRUM`, `BASE`, `OPTIMISM`): `0x` + 40 hexadecimal address structure.
- SOLANA: Base58 public-address structure.

Adding a future network requires an explicit registry + validator addition; unknown networks are not silently accepted.

Initial account creation requires a QR image so every active account is immediately usable by the USER flow.

Allowed account update fields:

```text
label
qrCodeDataUrl
isActive
```

Not editable:

```text
asset
network
walletAddress
```

## 4. Deposit model and lifecycle

Statuses:

```text
AWAITING_TXID
PENDING_REVIEW
APPROVED
REJECTED
```

Creation stores an immutable snapshot of:

```text
userId
packagePlanVersionId
packagePlanItemId
packageCode
packageDisplayName
amount
currency
assignedDepositAccountId
assignedAccountLabel
assignedWalletAddress
assignedNetwork
assignedQrCodeDataUrl
```

Mutable review fields are limited to:

```text
txid
submittedAt
reviewedByUserId
reviewedAt
reviewNote
status
```

## 5. Open-request rule

A USER may have only one open deposit at a time where status is:

```text
AWAITING_TXID
PENDING_REVIEW
```

Service writes `openKey = userId` for open states and releases it on terminal states. The unique open key prevents parallel open deposits for one user.

## 6. Package and receiving-account matching

Deposit creation accepts only `packagePlanItemId` from the currently effective published package plan.

The backend derives:

```text
amount = PackagePlanItem.price
currency = PackagePlanItem.currency
```

The client cannot override amount/currency.

Only package items with `availability = AVAILABLE` are eligible.

The receiving-account pool is filtered by:

```text
isActive = true
asset = PackagePlanItem.currency
```

If several active networks/accounts exist for that asset, the backend randomly assigns one and snapshots its network/address/QR. Therefore the USER cannot select a cheaper/different network or substitute an address after creation.

For current DEP-01 acceptance, configure only an ACTIVE `USDT / TRC20` account so the QA lane is deterministic while retaining the generalized foundation.

## 7. Transaction identifier validation

Validation is performed after the deposit is loaded, using its immutable `assignedNetwork`.

Current rules:

```text
TRC20   → exactly 64 hexadecimal characters, normalized lowercase
EVM     → 64 hexadecimal hash characters, optional 0x prefix, normalized lowercase without prefix
SOLANA  → Base58 transaction signature structure
```

Database uniqueness is scoped by:

```text
assignedNetwork + txid
```

Service-level conflict handling returns HTTP 409 for duplicates on that network.

## 8. RBAC

Permissions:

```text
deposits.accounts.read
deposits.accounts.manage
deposits.read
deposits.review
```

SUPER_ADMIN keeps platform-wide bypass authority through the existing permission guard.

ADMIN receives no implicit deposit authority. Permissions are delegated through existing RBAC configuration.

USER endpoints are authenticated standard-user endpoints and may only access the current USER's own deposits.

## 9. API contract

### USER

```text
GET  /deposits/me
POST /deposits
POST /deposits/:depositId/txid
```

`POST /deposits`

```json
{
  "packagePlanItemId": "uuid"
}
```

`POST /deposits/:depositId/txid`

```json
{
  "txid": "network-specific transaction identifier"
}
```

### ADMIN / SUPER_ADMIN

```text
GET   /admin/deposit-accounts
POST  /admin/deposit-accounts
PATCH /admin/deposit-accounts/:accountId
GET   /admin/deposits
GET   /admin/deposits/:depositId
POST  /admin/deposits/:depositId/approve
POST  /admin/deposits/:depositId/reject
```

Create-account payload includes:

```json
{
  "label": "Treasury A",
  "asset": "USDT",
  "network": "TRC20",
  "walletAddress": "public network address",
  "qrCodeDataUrl": "data:image/...;base64,...",
  "isActive": true,
  "reason": "Initial receiving account"
}
```

`asset` and `network` default to `USDT` / `TRC20` for backward-compatible current QA when omitted, but are persisted explicitly.

Review payload:

```json
{
  "note": "Manual review note"
}
```

`note` is required for both approval and rejection for auditability.

## 10. Database migrations

```text
0008_deposit_foundation
0009_deposit_network_generalization
```

`0008` is immutable migration history after application.

`0009` performs forward-only generalization:

- removes USDT-only/TRC20-only DB CHECK constraints;
- replaces global wallet-address uniqueness with `(asset, network, walletAddress)` uniqueness;
- adds asset/network/active lookup index;
- expands `deposits.txid` for network-specific identifiers;
- replaces global TXID uniqueness with `(assignedNetwork, txid)` uniqueness.

Never rewrite applied `0008` to achieve the generalized model.

## 11. Audit operations

Audit entries use existing `audit_logs` and record request context when available.

Operations:

```text
CREATE_DEPOSIT_ACCOUNT
UPDATE_DEPOSIT_ACCOUNT
CREATE_DEPOSIT_REQUEST
SUBMIT_DEPOSIT_TXID
APPROVE_DEPOSIT
REJECT_DEPOSIT
```

Audit metadata must not include secrets. Public wallet address/transaction identifier may be included where required for traceability.

## 12. Frontend / BFF

Browser auth stays same-origin BFF + HttpOnly/SameSite cookies.

ADMIN `/deposits` includes:

- asset/token input
- supported-network selector
- public receiving address without a hardcoded TRON browser pattern
- QR file selection converted client-side to a validated data URL
- active/inactive controls
- deposit review queue
- approve/reject controls with required note
- exact amount/network/transaction-ID/account display

USER `/user/deposits` includes:

- available effective package selector
- server-assigned asset/network/address
- scannable stored QR image
- copy address
- network-aware transaction-ID submission
- personal deposit history/status

Existing `/user/packages` remains catalogue-only in PKG-01. DEP-01 does not mark a package active.

## 13. Deferred by design

Not part of DEP-01:

- wallet balance
- immutable accounting ledger
- blockchain confirmation automation
- hot-wallet custody
- package subscription/activation
- referral commission generation
- reward generation
- withdrawals/payouts
- real or simulated trade accounting

These require later dedicated milestones and must consume the approved deposit fact idempotently rather than mutating DEP-01 history.
