# FixTradeZone — Permanent Deposit Address Lock

**Status:** Founder-approved implementation lock  
**Branch:** `feature/permanent-deposit-address`  
**Applies to:** USER deposit flow across all configured payment rails

## Locked business rule

Each USER has one persistent receiving-account assignment per payment rail.

```text
USER + PAYMENT RAIL -> ONE PERMANENT RECEIVING ACCOUNT
```

The assigned public address and QR remain stable across package selection, investment amount changes, repeated logins and later deposits on the same payment rail.

A different payment rail may have a different permanent assignment.

## Assignment behavior

- The first time a USER needs a supported ACTIVE payment rail, the backend assigns one ACTIVE receiving account from that rail's configured account pool.
- The assignment is persisted in `user_deposit_address_assignments` with a unique `(userId, paymentRailId)` key.
- Existing users are backfilled from their latest historical deposit account when that rail/account is still ACTIVE.
- Once assigned, a USER is never silently moved to another receiving account.
- If the assigned account is later disabled, new deposits fail safely with an unavailable-address response. Automatic reassignment is forbidden.
- No private key, seed phrase or signing material is introduced.

## Historical immutability

Existing `deposits` rows are not rewritten. Every deposit continues to retain its immutable receiving-account/network/address/QR snapshots.

The permanent assignment controls only which account future deposits use.

## USER experience lock

The USER deposit workspace is a single screen and does not expose a separate "Create deposit request" step.

Expected sequence:

```text
Select package + exact amount + payment network
-> permanent address + QR are visible automatically
-> USER pays externally
-> USER enters transaction ID
-> one Submit Deposit for Review action
-> PENDING_REVIEW
```

The permanent address is displayed before final submission. The backend still re-validates the effective package, exact range, payment rail, permanent assignment and transaction ID.

Legacy `AWAITING_TXID` requests remain recoverable so historical in-flight deposits are not stranded.

## Backend contract

### Ensure/load permanent address

`POST /deposits/address-assignment`

```json
{
  "paymentRailId": "uuid"
}
```

The operation is idempotent for the same USER/payment rail and returns the same address on repeat calls.

### Single-step deposit submission

`POST /deposits/submit`

```json
{
  "packagePlanItemId": "uuid",
  "paymentRailId": "uuid",
  "investmentAmount": "25",
  "txid": "network-valid-transaction-id"
}
```

A successful new submission is created directly as `PENDING_REVIEW`. Maker-checker ADMIN/SUPER_ADMIN approval, accounting posting, package activation, commissions and reward behavior remain unchanged.

### Legacy compatibility

`POST /deposits` remains available for compatibility but now also uses the permanent receiving assignment. `POST /deposits/:depositId/txid` remains available for pre-existing `AWAITING_TXID` requests.

## Database change

Forward migration only:

`0034_user_deposit_address_assignment`

No reset and no `prisma migrate dev`.

The migration creates `user_deposit_address_assignments`, enforces one assignment per USER/payment rail, and backfills stable assignments from active historical deposit-account usage where possible.

## Acceptance gates

1. Migration applies with `prisma migrate deploy`.
2. Repeating address-assignment call for the same USER/payment rail returns the exact same assignment/address.
3. Package or investment amount changes do not change the assigned address for that rail.
4. New one-step submission creates `PENDING_REVIEW` directly.
5. Deposit snapshot address/account matches the permanent assignment.
6. Duplicate TXID protection remains enforced.
7. One-open-deposit rule remains enforced.
8. Legacy `AWAITING_TXID` recovery still works.
9. ADMIN maker review and SUPER_ADMIN final approval remain unchanged.
10. Browser shows one deposit card/workspace with no separate create-request stage.

PR/main remains HOLD until local acceptance is GREEN.
