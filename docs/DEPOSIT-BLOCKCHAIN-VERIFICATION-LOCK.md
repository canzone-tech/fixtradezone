# FixTradeZone Deposit Blockchain Verification Lock

Status: **FOUNDER APPROVED — LOCKED**

This document is the source of truth for DEP-03 blockchain verification. It extends `DEPOSIT-PACKAGE-ACCOUNT-ROUTING-LOCK.md` without changing one-package-to-configured-account routing, immutable deposit snapshots, or the existing accounting/package lifecycle after a valid manual approval.

## 1. Phase 1 scope

Phase 1 is **automatic blockchain verification + manual verified-only approval** for configured EVM deposit payment rails on **BNB Smart Chain mainnet (chain ID 56)**.

Blockchain verification is configured per payment rail. Token contract address, token decimals and required confirmations are operational configuration and must not be hard-coded into package or USER flows.

Blockchain verification does not itself approve a deposit, credit a wallet, post a ledger transaction, activate a package, or trigger commissions/rewards.

`AUTO_AFTER_BLOCKCHAIN_VERIFIED` is outside Phase 1 and remains OFF until separately approved and implemented.

## 2. Verification authority

A syntactically valid transaction ID is not proof of payment.

For an enabled BSC/EVM rail, the backend verifies on-chain evidence through JSON-RPC and fails closed when evidence is incomplete or unavailable.

A successful verification requires all of the following:

1. the configured RPC reports the configured BSC mainnet chain ID;
2. the transaction receipt exists and is mined;
3. the receipt status indicates successful execution;
4. only standard ERC20/BEP20 `Transfer` logs emitted by the configured token contract are considered;
5. the transfer receiver in the event log equals the deposit's immutable receiving-address snapshot;
6. the sum of matching transfers equals the deposit's immutable submitted amount using configured token decimals and integer base-unit arithmetic; and
7. the receipt has reached the configured confirmation threshold.

For BEP20/ERC20 token transfers, the top-level transaction `to` field is **not** treated as the payment receiver because it commonly points to the token contract. Receiver and amount authority comes from matching `Transfer` event logs.

The sender address is not required to match a FixTradeZone USER identity because a valid payment may originate from an exchange, custody provider, or another external wallet.

## 3. Configuration and provider rules

An enabled Phase-1 rail requires:

- validation profile `EVM`;
- chain ID `56`;
- a valid configured EVM token contract address;
- token decimals confirmed through RPC; and
- a positive required-confirmation count.

Configuration is fail-safe. If the RPC or token contract cannot be probed, enabling/changing verification fails and the previous configuration remains authoritative.

Local development may use the bounded public BSC JSON-RPC fallback. Runtime infrastructure may override it with:

- `DEPOSIT_BSC_RPC_URL`;
- `DEPOSIT_BSC_RPC_TIMEOUT_MS`.

Production should use dedicated/redundant provider infrastructure. Provider credentials or secret URLs remain environment configuration and must never be stored in deposit records, audit payloads, or source code.

## 4. Persisted verification states

- `VERIFIED` — all configured chain/token/receiver/amount/confirmation checks passed.
- `PENDING` — transaction is not visible/mined yet or confirmations remain below the configured threshold.
- `FAILED` — deterministic on-chain evidence contradicts the submitted deposit, for example a reverted transaction, missing matching transfer, or amount mismatch.
- `UNAVAILABLE` — RPC/provider infrastructure cannot currently establish the result safely or returned malformed/inconsistent data.

Only `VERIFIED` satisfies the Phase-1 approval gate for a rail configured as `VERIFY_ONLY`.

A `VERIFIED` result is monotonic in Phase 1: repeated verification requests return the stored verified evidence rather than downgrading it because of a later transient RPC outage.

## 5. New-deposit submission behavior

New one-step USER package deposits continue to pass the locked server-side package/routing/amount/TxID-format checks and are created as `PENDING_REVIEW` with immutable package/account/address/network snapshots.

After the deposit transaction commits, the backend automatically attempts blockchain verification when the assigned payment rail is configured as `VERIFY_ONLY`.

The submitted deposit must not be lost when verification is pending or temporarily unavailable. It remains in manual review while the approval gate stays closed until verification reaches `VERIFIED`.

If blockchain verification is OFF for a payment rail, the existing manual approval lifecycle remains unchanged for that rail.

## 6. Founder-approved approval gate

For every new deposit on a `VERIFY_ONLY` rail:

```text
VERIFIED    -> manual SUPER_ADMIN approval allowed
PENDING     -> approval BLOCKED; retry verification
FAILED      -> approval BLOCKED; reject or investigate
UNAVAILABLE -> approval BLOCKED; retry when verification is available
NOT CHECKED -> approval BLOCKED; verification is required
```

The **backend guard is authoritative**. Frontend button state or rendering must never be the only protection.

The guard executes before approval, accounting, package activation, commission/reward processing, or any other downstream financial action. Therefore a required non-VERIFIED deposit cannot reach financial effects through direct SUPER_ADMIN approval or bulk approval.

Bulk approval processes each deposit independently through the same approval orchestrator and therefore the same blockchain gate.

Reject remains available for invalid or suspicious pending deposits and does not require a successful blockchain verification.

## 7. Historical approved deposits

Deposits already `APPROVED` before the verified-only gate is introduced are **not retroactively blocked or changed**.

DEP-03 must not reverse their status, ledger posting, wallet effect, package activation, commissions, rewards, or other previously completed lifecycle state.

Historical approved deposits may have blockchain evidence recorded later for audit/investigation, but a later non-VERIFIED result does not rewrite their completed financial history.

## 8. Replay, evidence and idempotency

The existing Deposit database invariant `@@unique([assignedNetwork, txid])` prevents the same normalized transaction ID from being submitted twice on the same network.

Verification evidence is stored per deposit. Repeated non-final verification attempts update the same evidence record and attempt count; they do not create financial effects.

Each evidence snapshot records chain, token contract, token decimals, required/observed confirmations, block number, on-chain amount, receiving address, TxID, status, checked time, verified time and failure details where applicable.

The deposit's immutable package/account/address/network/QR snapshots remain the verification target even if package routing changes later.

## 9. Admin UI

The Admin Deposits workspace must surface open-deposit blockchain state using clear labels equivalent to:

- `BLOCKCHAIN VERIFIED`;
- `PENDING CONFIRMATIONS`;
- `VERIFICATION FAILED`;
- `RPC UNAVAILABLE`;
- `NOT CHECKED` when no evidence exists yet.

Authorized reviewers have a **Verify blockchain / Retry blockchain verification** action. The UI must visibly state when approval remains blocked until `VERIFIED`.

The existing FixTradeZone universal theme, readability rules, Package Accounts collapse behavior, Deposit Queue behavior and package routing UX remain unchanged.

## 10. Acceptance gates before PR to main

1. GitHub Backend CI and Admin CI must be green.
2. Any forward migration required by the branch must be applied locally with `prisma migrate deploy`; never use `prisma migrate dev` and never reset the database.
3. Browser acceptance comes first for this UI integration and must prove the blockchain verification status panel/badges, Verify/Retry action, and visible verified-only approval policy without regressing the existing Deposit Queue.
4. A focused local API/Postman gate may then prove a required non-VERIFIED deposit is rejected by the approval endpoint before financial processing and that the normal manual SUPER_ADMIN lifecycle is available after `VERIFIED`.
5. SQL/readback proof must confirm persisted verification evidence and no unintended duplicate accounting/financial effects.
6. Historical already-approved deposits must remain unchanged.
7. PR to `main` is allowed only after all applicable local gates are green.

## 11. Completed Phase-1 API proof checkpoint

Local API acceptance before the approval integration proved:

- migration `0035_deposit_blockchain_verification` deployed forward-only;
- payment-rail blockchain configuration persisted and read back correctly;
- chain ID and token decimals were probed through BSC RPC;
- a syntactically valid but fake QA TxID remained `PENDING` with `TX_NOT_FOUND_OR_PENDING` and never became `VERIFIED`;
- verification evidence persisted and read back correctly; and
- the historical already-approved QA deposit remained `APPROVED` with its existing financial lifecycle untouched.
