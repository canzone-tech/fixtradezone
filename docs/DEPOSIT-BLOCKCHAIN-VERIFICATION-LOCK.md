# FixTradeZone Deposit Blockchain Verification Lock

Status: **FOUNDER APPROVED — LOCKED / LOCAL ACCEPTANCE IN PROGRESS**

This document is the source of truth for DEP-03 blockchain verification and deposit approval policy. It extends `DEPOSIT-PACKAGE-ACCOUNT-ROUTING-LOCK.md` without changing one-package-to-configured-account routing, immutable deposit snapshots, or the existing accounting/package activation/downstream lifecycle after a deposit is approved.

## 1. Blockchain verification authority

A syntactically valid transaction ID is not proof of payment.

For an enabled BSC/EVM payment rail, the backend verifies on-chain evidence through JSON-RPC. A successful verification requires all of the following:

1. the configured RPC reports BNB Smart Chain mainnet chain ID `56`;
2. the transaction receipt exists and is mined;
3. the receipt status indicates successful execution;
4. only standard ERC20/BEP20 `Transfer` logs emitted by the configured token contract are considered;
5. the transfer receiver in the event log equals the deposit's immutable receiving-address snapshot;
6. the sum of matching transfers equals the deposit's immutable submitted amount using configured token decimals and integer base-unit arithmetic; and
7. the receipt has reached the configured confirmation threshold.

For BEP20/ERC20 token transfers, the top-level transaction `to` field is not treated as the payment receiver because it commonly points to the token contract. Receiver and amount authority comes from matching `Transfer` event logs.

The sender address is not required to match a FixTradeZone USER identity because a valid payment may originate from an exchange, custody provider, or another external wallet.

## 2. Blockchain configuration

Blockchain verification is configured per deposit payment rail. Token contract address, token decimals and required confirmations are operational configuration and must not be hard-coded into package or USER flows.

An enabled BSC rail requires:

- validation profile `EVM`;
- chain ID `56`;
- a valid configured EVM token contract address;
- token decimals confirmed through RPC; and
- a positive required-confirmation count.

Configuration is fail-safe. If the RPC or token contract cannot be probed, enabling/changing verification fails and the previous configuration remains authoritative.

Local development may use the bounded public BSC JSON-RPC fallback. Runtime infrastructure may override it with `DEPOSIT_BSC_RPC_URL` and `DEPOSIT_BSC_RPC_TIMEOUT_MS`. Production should use dedicated/redundant provider infrastructure. Provider credentials or secret URLs must never be stored in deposit records, audit payloads, or source code.

## 3. Persisted verification states

- `VERIFIED` — all configured chain/token/receiver/amount/confirmation checks passed.
- `PENDING` — transaction is not visible/mined yet or confirmations remain below the configured threshold.
- `FAILED` — deterministic on-chain evidence contradicts the submitted deposit, for example a reverted transaction, missing matching transfer, or amount mismatch.
- `UNAVAILABLE` — RPC/provider infrastructure cannot currently establish the result safely or returned malformed/inconsistent data.

A `VERIFIED` result is monotonic: repeated verification requests return the stored verified evidence rather than downgrading it because of a later transient RPC outage.

Verification evidence itself never directly credits a wallet, posts a ledger transaction, activates a package, or triggers commissions/rewards. Financial effects enter only through the existing deposit approval orchestrator.

## 4. Founder-approved deposit approval modes

SUPER_ADMIN controls one mutually exclusive approval policy per active payment rail:

### `MANUAL`

`MANUAL` is the safe default. A missing approval-policy row is interpreted as `MANUAL`.

- SUPER_ADMIN owns the final approve/reject decision.
- Blockchain verification still runs and its evidence remains visible when verification is configured for the rail.
- `PENDING`, `FAILED` or `UNAVAILABLE` blockchain evidence does not technically hard-block the SUPER_ADMIN manual approve endpoint in this mode.
- The UI must make contradictory or incomplete blockchain evidence prominent so the human decision is informed.
- Reject remains available.
- Bulk approval is a manual SUPER_ADMIN path and therefore follows the same `MANUAL` policy check per deposit.

This mode is the required operational fallback while automatic approval has not yet completed positive real-chain acceptance.

### `AUTO_AFTER_BLOCKCHAIN_VERIFIED`

This mode may be enabled only when the payment rail has a complete BSC `VERIFY_ONLY` blockchain configuration.

- Manual SUPER_ADMIN approval is disabled while this mode is active.
- `VERIFIED` is mandatory before automatic approval.
- `PENDING`, `UNAVAILABLE`, `FAILED`, or missing evidence cannot enter automatic approval.
- `PENDING` and `UNAVAILABLE` may be retried automatically.
- Deterministic `FAILED` evidence is not repeatedly auto-approved or silently overridden; it requires review/rejection/investigation.
- Once verification is `VERIFIED`, the system invokes the existing approval orchestrator and therefore preserves the current accounting, package activation, commission, reward, and recovery/idempotency behavior.
- Reject remains available before approval.

The backend policy guard is authoritative. Frontend rendering is never the only protection.

## 5. Approval mode administration

Approval mode is stored separately from blockchain-verification configuration in `deposit_payment_rail_approval_configs`.

Each mode change records:

- payment rail;
- selected approval mode;
- revision;
- SUPER_ADMIN actor;
- audit reason; and
- created/updated timestamps.

Only an authenticated active SUPER_ADMIN may make the policy decision. Existing RBAC permission checks remain in place, but the service also enforces the SUPER_ADMIN role so a delegated permission cannot silently enable financial automation.

Changing the mode does not rewrite already `APPROVED` or `REJECTED` deposits or any completed ledger/package/downstream history.

## 6. New-deposit behavior

New one-step USER package deposits continue to pass the locked server-side package/routing/amount/TxID-format checks and are created with immutable package/account/address/network snapshots.

After the deposit transaction commits, the backend attempts blockchain verification when the assigned payment rail is configured as `VERIFY_ONLY`.

The deposit is never discarded because verification is pending or temporarily unavailable.

- Under `MANUAL`, verification evidence is returned/displayed but SUPER_ADMIN remains the final decision maker.
- Under `AUTO_AFTER_BLOCKCHAIN_VERIFIED`, the deposit waits until verification is `VERIFIED`; only then may automatic approval run.

If blockchain verification is OFF for a payment rail, `AUTO_AFTER_BLOCKCHAIN_VERIFIED` cannot be enabled for that rail.

## 7. Automatic retry worker

A bounded deposit blockchain worker provides eventual processing for AUTO mode.

- It is armed at a 60-second interval outside the test environment.
- It selects only open deposits on rails explicitly configured `AUTO_AFTER_BLOCKCHAIN_VERIFIED` with blockchain verification enabled.
- It retries unresolved `PENDING`/`UNAVAILABLE` evidence on a bounded cadence.
- It does not repeatedly process deterministic `FAILED` evidence.
- It uses a Redis distributed lock so multiple backend instances do not intentionally run the same batch concurrently.
- It processes a bounded batch and fails safely per deposit.
- If Redis, RPC, configured audit actor, or another required dependency is unavailable, automatic approval pauses rather than bypassing the gate.

The SUPER_ADMIN who enabled AUTO is retained as the configured audit actor. Automatic processing additionally identifies itself through the worker request context and explicit auto-approval note. The configured actor must still exist, be ACTIVE, and retain SUPER_ADMIN; otherwise automation fails closed.

## 8. Replay, evidence and idempotency

The existing Deposit database invariant `@@unique([assignedNetwork, txid])` prevents the same normalized transaction ID from being submitted twice on the same network.

Verification evidence is stored per deposit. Repeated non-final verification attempts update the same evidence record and attempt count; they do not create duplicate financial effects.

Each evidence snapshot records chain, token contract, token decimals, required/observed confirmations, block number, on-chain amount, receiving address, TxID, status, checked time, verified time and failure details where applicable.

The deposit's immutable package/account/address/network/QR snapshots remain the verification target even if package routing changes later.

Existing approval/accounting/package services retain their own concurrency and idempotency controls; AUTO mode must reuse them rather than creating a parallel financial posting path.

## 9. Admin UI

The SUPER_ADMIN Deposits workspace exposes a dedicated **Deposit approval mode** panel for each active payment rail.

The selector contains exactly:

- `MANUAL`;
- `AUTO AFTER BLOCKCHAIN VERIFIED`.

Changing the mode requires an audit reason. Enabling AUTO requires explicit confirmation in the browser and is disabled when the backend reports that the rail is not eligible.

The Blockchain Verification panel continues to surface open-deposit states such as:

- `BLOCKCHAIN VERIFIED`;
- `PENDING CONFIRMATIONS`;
- `VERIFICATION FAILED`;
- `RPC UNAVAILABLE`;
- `NOT CHECKED`.

It also displays the effective approval mode for each deposit and keeps Verify/Retry available to authorized reviewers. MANUAL copy must not falsely state that approval is technically blocked until `VERIFIED`; AUTO copy must clearly state that automatic approval waits for `VERIFIED`.

The existing FixTradeZone universal theme, readability rules, Package Accounts collapse behavior, package routing UX, and reject workflow remain unchanged.

## 10. Historical deposits

Deposits already `APPROVED` before DEP-03 or before a later policy change are not retroactively blocked or rewritten.

DEP-03 must not reverse their status, ledger posting, wallet effect, package activation, commissions, rewards, or other completed lifecycle state.

Historical blockchain evidence may be recorded later for audit/investigation, but it cannot rewrite completed financial history.

## 11. Completed negative-security acceptance

Local DEP-03 acceptance already proved:

- blockchain configuration persisted and read back correctly;
- chain ID and token decimals were probed through BSC RPC;
- a syntactically valid but fake QA TxID remained `PENDING` with `TX_NOT_FOUND_OR_PENDING` and never became `VERIFIED`;
- verification evidence persisted and read back correctly;
- the Admin Blockchain Verification panel showed the negative result;
- under the earlier verified-only intermediate guard, a fake transaction could not reach approval; and
- the negative QA deposit was cleanly rejected afterward.

That intermediate verified-only manual guard is superseded by the Founder-approved explicit `MANUAL` versus `AUTO_AFTER_BLOCKCHAIN_VERIFIED` policy described in this document.

## 12. Acceptance gates before PR to main

1. GitHub Backend CI and Admin CI must be green.
2. Migration `0037_deposit_approval_mode` and any other pending forward migration must be applied locally using `prisma migrate deploy`; never use `prisma migrate dev` and never reset the database.
3. Browser acceptance comes first and must prove the SUPER_ADMIN approval-mode panel loads with `MANUAL` as the safe default and persists/readbacks an explicit MANUAL selection with audit reason.
4. Browser acceptance must prove blockchain evidence remains visible under MANUAL and that the normal SUPER_ADMIN manual approval path remains available.
5. AUTO must not be treated as locally accepted until a genuine BSC mainnet transfer proves exact configured token, exact snapshotted receiving address, exact submitted amount, required confirmations, `VERIFIED`, and automatic approval through the existing financial lifecycle.
6. Until that positive real-chain proof exists, local operational mode should remain `MANUAL`.
7. Focused Postman/API or SQL/readback proof may be used after browser acceptance where it adds evidence without repeating completed tests.
8. Historical already-approved/rejected deposits must remain unchanged.
9. PR to `main` is allowed only after all applicable local gates are green.
