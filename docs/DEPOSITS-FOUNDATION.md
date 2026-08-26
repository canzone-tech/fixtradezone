# FixTradeZone — DEP-01 Deposit Foundation

**Status:** LOCKED IMPLEMENTATION CONTRACT  
**Scope:** DEP-01A receiving-account management + DEP-01B deposit request/TXID/manual review  
**Network:** USDT on TRON / TRC20 only for v1

## 1. Purpose

DEP-01 creates the launch-critical manual deposit workflow without introducing a wallet ledger, package activation, automated blockchain verification, private-key custody or trading behavior.

The accepted flow is:

```text
USER selects an available package
→ backend validates the currently effective published package item
→ backend randomly assigns one ACTIVE USDT TRC20 receiving account
→ USER receives exact amount + assigned public address + QR image
→ USER pays externally
→ USER submits the TRON transaction ID (TXID)
→ deposit becomes PENDING_REVIEW
→ authorized ADMIN/SUPER_ADMIN manually APPROVES or REJECTS
→ approval is recorded as an immutable reviewed payment fact
→ ledger credit/package activation remain deferred to later milestones
```

## 2. Non-negotiable integrity rules

- Backend is authoritative for package, amount, account assignment and status transitions.
- USER never chooses a receiving account.
- Assignment is random across currently ACTIVE receiving accounts.
- Only public receiving addresses and QR images are stored. **No private key, seed phrase, signing key or wallet secret may be stored.**
- Receiving account address is immutable after creation. To replace an address, disable the old account and create another account.
- Historical deposits preserve an assignment snapshot even if the receiving account is later renamed, QR-updated or disabled.
- TXID is normalized to lowercase and globally unique.
- A TXID may never credit/review two deposits.
- Money uses exact SQL `DECIMAL`; never JavaScript floating point for authoritative values.
- Financial/admin transitions are auditable.
- Approval/rejection is idempotent by state: only `PENDING_REVIEW` may transition to `APPROVED` or `REJECTED`.
- Approval does **not** create balance, ledger, earnings, commission or package activation in DEP-01.
- Rejected deposits are terminal for DEP-01; the USER creates a new deposit request for another payment attempt.
- No automatic blockchain/RPC/explorer verification in DEP-01. Manual review is the v1 authority.
- All API responses containing deposit/account state use `Cache-Control: no-store`.

## 3. Receiving-account model

Each receiving account stores:

- immutable UUID
- operator label
- asset = `USDT`
- network = `TRC20`
- immutable TRON public address
- QR image data URL (`image/png`, `image/jpeg`, `image/webp` or `image/svg+xml`), maximum 256 KiB encoded payload
- active/inactive state
- optimistic `revision`
- created/updated actor and timestamps

Initial account creation requires a QR image so every account is immediately usable by the USER flow.

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

This is the safe v1 default. It avoids parallel manual-payment ambiguity and can be made configurable in a later plan version if required.

## 6. Package validation

Deposit creation accepts only `packagePlanItemId` from the currently effective published package plan.

The backend derives:

```text
amount = PackagePlanItem.price
currency = PackagePlanItem.currency
```

The client cannot override amount/currency.

Only package items with `availability = AVAILABLE` are eligible for a new deposit.

## 7. TXID validation

TRON transaction IDs are accepted as exactly 64 hexadecimal characters.

Normalization:

```text
trim
lowercase
```

Database uniqueness is authoritative and service-level conflict handling returns HTTP 409 for duplicates.

## 8. RBAC

New permissions:

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
  "txid": "64-hex-characters"
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

Review payload:

```json
{
  "note": "Manual review note"
}
```

`note` is required for both approval and rejection for auditability.

## 10. Audit operations

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

Audit metadata must not include secrets. Public wallet address/TXID may be included where required for traceability.

## 11. Frontend / BFF

Browser auth stays same-origin BFF + HttpOnly/SameSite cookies.

ADMIN page:

```text
/deposits
```

Includes:

- receiving-account create/manage section
- QR file selection converted client-side to a validated data URL
- active/inactive controls
- deposit review queue
- review detail
- approve/reject controls with required note
- exact amount/network/TXID/account display

USER page:

```text
/user/deposits
```

Includes:

- available effective package selector
- create deposit action
- assigned USDT TRC20 address
- scannable stored QR image
- copy address
- TXID submission
- personal deposit history/status

Existing `/user/packages` remains catalogue-only in PKG-01. DEP-01 may link users to `/user/deposits` but does not mark a package active.

## 12. Deferred by design

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
