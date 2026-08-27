# FixTradeZone — DEP-01 Deposit Foundation

**Status:** LOCKED IMPLEMENTATION CONTRACT — PAYMENT-RAIL HARDENING PENDING LOCAL ACCEPTANCE  
**Scope:** payment-rail master + receiving accounts + deposit request + transaction ID + manual review  
**Current QA lane:** USDT on TRON / TRC20  
**Foundation rule:** asset/network support is data-driven. TRC20 is a seeded rail, not a platform-wide hardcode.

## 1. Purpose

DEP-01 creates the launch-critical manual deposit workflow without wallet balance, ledger credit, package activation, blockchain automation, private-key custody or trading behavior.

```text
ADMIN configures supported payment rail (asset + network + validator profile)
→ ADMIN attaches one or more public receiving accounts to that rail
→ USER selects an available package
→ backend derives authoritative package amount + currency
→ USER selects an ACTIVE compatible payment rail for that currency
→ backend randomly assigns one ACTIVE receiving account inside that rail
→ USER receives exact amount + network + public address + matching QR
→ USER pays externally on that exact network
→ USER submits that network's transaction identifier
→ PENDING_REVIEW
→ authorized ADMIN/SUPER_ADMIN APPROVES or REJECTS
→ immutable reviewed payment fact is retained
→ accounting credit/package activation remain later milestones
```

## 2. Why payment rails are first-class data

Receiving accounts do not accept arbitrary asset/network strings. A receiving account references a configured `DepositPaymentRail`.

A payment rail defines:

```text
asset
networkCode
displayName
validationProfile
isActive
revision
created/updated actor + timestamps
```

Examples of data, not hardcoded application enums:

```text
USDT + TRC20
USDT + ETHEREUM
USDC + ETHEREUM
USDC + SOLANA
```

Adding another asset/network pair does not require changing the receiving-account schema or adding another frontend hardcoded network option.

## 3. Validator profiles

Protocol parsing remains versioned code because address and transaction validation is security-sensitive. Payment rails select one supported validator profile:

```text
TRON
EVM
SOLANA
```

The network code is data-driven; the profile selects the protocol implementation.

V1 validators:

- `TRON`: Base58Check mainnet address; 64-hex transaction ID.
- `EVM`: `0x` + 40-hex address; 32-byte transaction hash, `0x` prefix accepted and normalized away.
- `SOLANA`: Base58 public-key/signature shape validation.

A network code already used with one validator profile may not be created with a conflicting profile through the service contract.

New protocol families require reviewed code support before an Admin can safely use them. Unknown validation semantics are never silently accepted.

## 4. Payment-rail mutability

Immutable after rail creation:

```text
asset
networkCode
validationProfile
```

Mutable with optimistic revision + audit reason:

```text
displayName
isActive
```

Changing protocol identity requires a new rail. Historical payment facts are never reinterpreted.

## 5. Receiving-account integrity

Each account stores:

```text
id
label
paymentRailId
asset snapshot
network snapshot
public walletAddress
matching qrCodeDataUrl
isActive
revision
created/updated actor + timestamps
```

Rules:

- No private key, seed phrase, signing key or wallet secret may be stored.
- Address is immutable after account creation.
- Replacement means disable old account and create another.
- Account address is validated using its payment rail's validator profile.
- An account cannot be activated while its payment rail is inactive.
- Uniqueness is `paymentRailId + walletAddress`, not wallet address globally.
- Multiple active accounts may exist on one rail for random assignment.
- Historical deposits keep their own account/network/validation snapshots.

## 6. USER network choice and server account assignment

If a currency has more than one ACTIVE payment rail, the USER chooses the payment network. The backend never randomly chooses a blockchain/network for the USER.

After the USER chooses the rail, the backend randomly assigns an ACTIVE account **within that exact rail**.

This prevents wrong-chain payment ambiguity while retaining account-pool distribution.

## 7. Package authority

Deposit creation accepts:

```json
{
  "packagePlanItemId": "uuid",
  "paymentRailId": "uuid"
}
```

The backend validates the currently effective published package and derives:

```text
amount = PackagePlanItem.price
currency = PackagePlanItem.currency
```

The selected payment rail must be ACTIVE and `rail.asset == package currency`.

The client cannot override amount, currency, assigned address or QR.

## 8. Deposit lifecycle

Statuses:

```text
AWAITING_TXID
PENDING_REVIEW
APPROVED
REJECTED
```

Creation stores immutable snapshots including:

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
assignedValidationProfile
assignedQrCodeDataUrl
```

Only these lifecycle/review fields mutate:

```text
txid
submittedAt
reviewedByUserId
reviewedAt
reviewNote
status
openKey
```

## 9. One-open-deposit rule

A USER may have only one open deposit where status is:

```text
AWAITING_TXID
PENDING_REVIEW
```

`openKey` is unique while open and becomes `NULL` on terminal review. Service writes `openKey = userId`; database uniqueness prevents concurrent open requests.

## 10. Transaction-ID integrity

Transaction IDs are validated and normalized using the **immutable `assignedValidationProfile` snapshot**, not mutable rail configuration.

Database uniqueness is scoped by `assignedNetwork + txid` so the same network transaction cannot be reused across deposit requests.

Invalid protocol-specific transaction identifiers return HTTP 400. Duplicate identifiers return HTTP 409.

## 11. Manual review

Only `PENDING_REVIEW` may transition to:

```text
APPROVED
REJECTED
```

Both require a review note and actor/timestamp audit trail.

Approval records the payment fact only. DEP-01 does **not** create:

- wallet balance;
- ledger credit;
- package activation;
- referral commission;
- rewards/cap consumption;
- withdrawal/payout;
- blockchain custody/signing;
- real or simulated trade accounting.

Later modules must consume an approved deposit idempotently rather than rewriting DEP-01 history.

## 12. RBAC

Existing deposit permissions remain:

```text
deposits.accounts.read
deposits.accounts.manage
deposits.read
deposits.review
```

Payment-rail configuration is part of deposit-account management in DEP-01 and uses `deposits.accounts.manage`.

SUPER_ADMIN retains existing platform-wide bypass. ADMIN receives no implicit financial authority.

## 13. API contract

### USER

```text
GET  /deposits/payment-rails?asset=USDT
GET  /deposits/me
POST /deposits
POST /deposits/:depositId/txid
```

### ADMIN / SUPER_ADMIN

```text
GET   /admin/deposit-payment-rails
POST  /admin/deposit-payment-rails
PATCH /admin/deposit-payment-rails/:railId
GET   /admin/deposit-accounts
POST  /admin/deposit-accounts
PATCH /admin/deposit-accounts/:accountId
GET   /admin/deposits
GET   /admin/deposits/:depositId
POST  /admin/deposits/:depositId/approve
POST  /admin/deposits/:depositId/reject
```

All deposit/payment-rail/account state responses use `Cache-Control: no-store`.

## 14. Migration history

`0008_deposit_foundation` is historical and already applied locally. It must never be rewritten.

`0009_deposit_network_generalization` is the forward hardening migration and is still pending local deployment. It:

- creates `deposit_payment_rails`;
- seeds the deterministic V1 USDT/TRC20/TRON rail;
- backfills existing 0008 receiving accounts to that rail;
- makes accounts reference a rail;
- removes TRC20/USDT SQL hard constraints that would block future rails;
- expands transaction-ID storage;
- snapshots `assignedValidationProfile` on deposits;
- preserves historical 0008 data.

Do not deploy `0009` until the complete code gate is GREEN.

## 15. Frontend contract

ADMIN `/deposits`:

- configure payment rails;
- choose only a configured rail when creating a receiving account;
- upload matching QR;
- manage active/inactive rail/account state;
- review deposits with required notes.

USER `/user/deposits`:

- choose package;
- choose an eligible payment network for that package currency;
- receive backend-assigned address/QR from that network's pool;
- submit the network-specific transaction identifier;
- view immutable status/history.

Browser authentication remains same-origin BFF + HttpOnly/SameSite cookies. Browser JavaScript never owns backend bearer/refresh tokens.

## 16. Current QA lane

The first combined local/Postman acceptance continues to use the seeded:

```text
asset: USDT
networkCode: TRC20
validationProfile: TRON
```

That is a test/launch configuration, not a global platform limitation.
