# FixTradeZone Deposit Package Account Routing Lock

Status: **FOUNDER / CLIENT APPROVED — LOCKED**

This document is the source of truth for the package-funded USER deposit routing introduced by migration `0034_package_deposit_account_routing`.

This lock **supersedes the unpublished per-user permanent-address design** that temporarily existed on the feature branch. There is no USER + payment-network permanent receiving-address assignment in the approved architecture.

## 1. Routing invariant

Each package definition resolves to **exactly one configured receiving account** for new deposits.

- Package → one receiving account.
- The same receiving account may be configured for more than one package.
- There is no random account-pool selection for USER package deposits.
- There is no per-user receiving-account assignment.
- All users choosing the same package see the same currently configured receiving account, address, QR and network.
- Routing is keyed by stable `packageDefinitionId`, not by a single package-plan version item.

Runtime routing authority is the MySQL table:

`deposit_package_account_routes`

Its primary key is `packageDefinitionId`, enforcing at most one configured account per package definition.

## 2. Administrative configuration

SUPER_ADMIN and authorized ADMIN users manage package receiving-account routes through the existing deposit-account permissions.

A route may only be saved when:

- the package exists in the effective published catalogue;
- the selected receiving account exists;
- the receiving account is ACTIVE;
- its payment rail is ACTIVE; and
- the receiving account asset matches the package currency.

Removing a route is allowed as an explicit administrative action with an audit reason. A package with no configured route cannot accept a new deposit.

Every route change is audit logged with the previous account, new account and supplied reason.

## 3. USER flow

The USER package catalogue is the entry point.

`Choose Investment` on a package opens:

`/user/deposits/<packagePlanItemId>`

The deposit page is locked to that package. It must not contain a package selector or network selector.

The page shows before submission:

- selected package name/code;
- investment range;
- duration;
- configured receiving-account label;
- network;
- QR;
- public receiving address;
- investment amount input; and
- transaction ID input.

The only new-deposit action is **Submit Deposit**.

There is no intermediate **Create deposit request** action.

Direct navigation to `/user/deposits` redirects to `/user/packages` so package context must originate from the package catalogue.

## 4. Server-side authority

The frontend never chooses or submits the receiving account or network for a new package deposit.

The backend must:

1. resolve the requested package-plan item against the one effective PUBLISHED plan;
2. confirm the item is AVAILABLE;
3. resolve its stable package definition;
4. resolve the package's configured receiving account from `deposit_package_account_routes`;
5. confirm the account and payment rail are active and asset-compatible;
6. validate the investment against the published package range;
7. validate the transaction ID using the configured account's payment-rail validation profile; and
8. create the deposit directly in `PENDING_REVIEW` with immutable routing and package snapshots.

Missing, inactive or currency-mismatched routing fails safely. The backend must never fall back to another receiving account.

## 5. Historical immutability

Existing deposits are never rewritten when package routing changes.

Each deposit continues to snapshot:

- package plan/version/item and package identity;
- exact investment and package terms;
- assigned deposit-account ID and label;
- public receiving address;
- network and validation profile;
- QR data; and
- submitted transaction ID.

Changing a package's configured receiving account only affects future deposits created after the change.

## 6. Legacy open-deposit recovery

Deposits created before this routing revision may already be in `AWAITING_TXID`.

Those historical open deposits retain their snapshotted address/network and may use the existing transaction-ID submission endpoint to complete that already-created request.

New package deposits do not use `AWAITING_TXID`; a valid one-step submission is created directly as `PENDING_REVIEW`.

Only one open deposit per user remains enforced by the existing `openKey` invariant.

## 7. Approval and accounting lifecycle

This routing revision does not alter deposit approval, maker/checker behavior, accounting posting, package activation, commissions, rewards or ledger rules.

A newly submitted deposit still enters the existing manual review/approval lifecycle. Financial effects remain governed by the existing approval/accounting architecture.

## 8. Acceptance gates

Before PR to `main`:

1. GitHub Backend CI and Admin CI must be green.
2. Migration `0034_package_deposit_account_routing` must be applied locally using `prisma migrate deploy`; never `prisma migrate dev` and never reset the database.
3. Local Postman acceptance must prove package route configuration/readback, package-specific context, direct `PENDING_REVIEW` submission and persisted routing snapshot.
4. SQL readback must prove one route per package and exact route-to-deposit account matching.
5. Browser acceptance must prove `Choose Investment` opens only the chosen package, shows the configured address/QR before submission, exposes no package/network selector, and uses one final submit action.
6. PR to `main` is allowed only after all local gates are green.
