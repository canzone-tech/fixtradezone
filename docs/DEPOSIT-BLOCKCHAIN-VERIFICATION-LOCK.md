# Deposit Blockchain Verification Lock

Status: DEP-03 phase 1 implementation / local acceptance pending.

## Purpose

FixTradeZone must not treat a syntactically valid transaction ID as proof that a real blockchain payment occurred. Blockchain verification is a security layer that validates submitted deposit evidence against the configured package receiving account before an operator relies on it.

## Phase 1 scope

Phase 1 is `VERIFY_ONLY`.

- BNB Smart Chain mainnet only.
- EVM/BEP20 payment rails only.
- Blockchain verification does not approve a deposit.
- Blockchain verification does not credit any wallet or ledger.
- Blockchain verification does not activate a package.
- Blockchain verification does not trigger commissions, rewards, simulated activity, internal trading, or other downstream earnings.
- Existing SUPER_ADMIN manual approval remains the financial authorization gate during phase 1.
- Automatic approval is explicitly out of scope until the verification layer passes local API acceptance and later acceptance gates.

## Configuration rule

Blockchain verification is configured per deposit payment rail. The configuration stores:

- verification mode (`OFF` or `VERIFY_ONLY`)
- chain ID
- token contract address
- token decimals
- required confirmations
- revision and audit actor

The token contract is configuration, never a source-code constant. FixTradeZone must not guess a BEP20 USDT contract address.

For phase 1, enabled verification requires:

- EVM validation profile
- BNB Smart Chain mainnet chain ID `56`
- a valid EVM token contract address
- token decimals confirmed through the configured RPC
- at least one required confirmation

Configuration is fail-safe: if the RPC or token contract cannot be probed, enabling verification fails and the previous configuration remains unchanged.

## RPC rule

Local development may use the default public BNB Smart Chain JSON-RPC endpoint without an API key. Runtime configuration may override it with `DEPOSIT_BSC_RPC_URL`; the URL is treated as infrastructure configuration and must not be stored in deposit records or audit payloads. `DEPOSIT_BSC_RPC_TIMEOUT_MS` bounds network waits.

Production may use a dedicated provider endpoint, but provider credentials or secret URLs must remain environment configuration and must never be committed.

## Verification evidence

For a deposit with verification enabled, the verifier checks the snapshotted deposit evidence, not the current package route. Historical route changes therefore cannot rewrite the verification target.

A successful phase-1 verification requires all of the following:

1. RPC chain ID matches the configured chain ID.
2. The transaction receipt exists and is mined.
3. The transaction receipt status is successful.
4. A standard ERC20/BEP20 `Transfer` event emitted by the configured token contract sends funds to the deposit's snapshotted receiving address.
5. The sum of matching transfer events to that receiving address equals the deposit's exact submitted amount using integer base-unit arithmetic.
6. The receipt has at least the configured confirmation count.
7. Existing deposit uniqueness prevents the same `(assignedNetwork, txid)` from being submitted twice.

The sender address is not used as an identity gate because users may fund from an exchange, custody provider, or another wallet.

## Result states

- `VERIFIED`: all checks passed and the required confirmation threshold was met.
- `PENDING`: transaction is not mined/visible yet or confirmations are still below the configured threshold.
- `FAILED`: deterministic on-chain evidence contradicts the deposit, for example reverted transaction, missing matching transfer, or amount mismatch.
- `UNAVAILABLE`: verification infrastructure is unavailable or returned inconsistent/malformed data.

A `VERIFIED` result is monotonic in phase 1: repeated manual verification requests return the stored verified evidence rather than downgrading it because of a later transient RPC outage.

## Audit and immutability

Each verification attempt records a bounded evidence snapshot including chain, token contract, token decimals, required/observed confirmations, block number, on-chain amount, receiving address, TxID, status, and failure reason where applicable. RPC endpoint URLs and provider secrets are never recorded.

The deposit's package/account/address/network/QR snapshots remain immutable and continue to be the basis for verification.

## API acceptance gate

Before any automatic submission hook or approval guard is added, local acceptance must prove:

- migration `0035_deposit_blockchain_verification` deploys forward-only with `prisma migrate deploy`;
- rail blockchain config readback works;
- enabling config proves chain/token decimals through BSC RPC;
- a known fake/local QA TxID cannot become `VERIFIED`;
- verification evidence is persisted and readable;
- no deposit status, wallet, ledger, subscription, commission, reward, or trading state is changed by verification.

After this gate is green, the next implementation step may automatically request verification after submission and require `VERIFIED` before manual approval when that rail is in `VERIFY_ONLY` mode. Automatic approval remains a separate future decision.
