# FixTradeZone — PKG-01 Packages / Plan Foundation Contract

**Status:** FOUNDER APPROVED — IMPLEMENTATION AUTHORITY  
**Approval date:** 2026-08-25  
**Approved decision set:** Q33–Q39 Option A plus the initial safe defaults in
`docs/MLM-BUSINESS-RULES.md`

## 1. Slice Outcome

PKG-01 delivers a versioned package catalogue, an audited administrator
draft/publication workflow, and a protected read-only USER catalogue.

PKG-01 does **not** implement:
- package selection, purchase, payment or deposit assignment;
- TXID submission or payment approval;
- user-package activation, renewal or upgrade execution;
- wallet balances, ledger entries, earnings or cap consumption;
- commission, reward or matching calculation;
- real or simulated activity generation.

The absence of those features is an authorization and accounting boundary, not
an incomplete shortcut. No activation endpoint exists in PKG-01.

## 2. Aggregate and Ownership

### PackageDefinition

Stable immutable package identity, for example `NEURAL_SCOUT`. It contains no
commercial or financial terms.

### PackagePlanVersion

Atomic version of plan-wide settings, lifecycle policy and effective dates.
Every draft mutation increments a plan-wide revision used for optimistic
concurrency.

### PackagePlanItem

Immutable-after-publication commercial terms for one package definition within
one plan version.

### UserPackage

Defined by the approved lifecycle contract but intentionally deferred until an
authoritative activation source and ledger/subscription boundary exist.

## 3. Publication and Historical Integrity

- `DRAFT` versions are editable through validated administrator commands.
- `PUBLISHED` commercial terms and package items are immutable.
- A whole plan version is published atomically; items from different versions
  are never mixed into one effective catalogue.
- Corrections require cloning a published version into a new draft.
- `effectiveFrom` and `effectiveTo` are UTC instants and published ranges may
  not overlap.
- Event-time resolution returns exactly one applicable published version.
- A new plan initially applies to `NEW_PACKAGE_ACTIVATIONS` only.
- Historical subscriptions/events will retain the exact plan-item identifier
  used at the time of the event.
- No published version or item may be hard-deleted.
- Initial V1 values are installed as an unpublished migration-owned draft.
  SUPER_ADMIN must explicitly review and publish it.
- Draft writes require `expectedRevision`; stale writes fail with HTTP 409.

## 4. Precision and Serialization

- Package price: MySQL `DECIMAL(20,8)`.
- Percentage values: MySQL `DECIMAL(9,6)` in percentage points. The string
  `"0.400000"` means 0.40%.
- Cap multiplier: MySQL `DECIMAL(10,4)`.
- All money, percentage and multiplier values are JSON strings.
- Day counts, revisions and sort orders are integers.
- Every plan item has an explicit `USDT` currency code.
- Maximum total return and profit are derived from price, cap basis, multiplier
  and principal treatment; they are not stored as mutable source-of-truth fields.

## 5. Typed Package Terms

Every `PackagePlanItem` stores:
- package definition, versioned display name and slug;
- sort order and `AVAILABLE`, `HIDDEN` or
  `CLOSED_TO_NEW_ACTIVATIONS` availability;
- positive price and explicit currency;
- `FIXED`, `RANDOM_RANGE`, `MANUAL` or `RULE_BASED` rate mode;
- fixed/minimum/maximum percentage columns;
- `GROSS_BEFORE_SPLIT` or `USER_NET_AFTER_SPLIT` rate meaning;
- `TOTAL_RETURN` or `PROFIT_ONLY` cap basis;
- cap multiplier and principal treatment;
- positive lifetime/goal days and separate positive cycle days;
- reward start, frequency, cycle-day and reward-day modes;
- cycle-end and cap-reached actions.

Core financial terms use typed columns and constraints, not an opaque JSON
configuration blob.

## 6. Approved V1 Plan-Wide Defaults

| Setting | Initial configured value |
|---|---|
| Currency support | `USDT` only; no FX conversion |
| Active-package mode | `SINGLE_ACTIVE` |
| Multiple-package fallback basis | `HIGHEST_ACTIVE_PACKAGE` |
| Activation trigger | `PAYMENT_APPROVED` |
| Plan migration | `NEW_PACKAGE_ACTIVATIONS` |
| Settlement timezone | `UTC` |
| Renewal | `MANUAL_AFTER_TERMINAL`; no rollover |
| Upgrade | Disabled until subscription/payment/ledger support exists |

## 7. Approved Initial Catalogue Draft

| Code | Display name | Price (USDT) | User/net rate | Cap | Goal | Cycle |
|---|---|---:|---:|---:|---:|---:|
| `NEURAL_SCOUT` | Neural Scout | 5 | 0.40–0.60% | 2X | 90d | 10d |
| `NEURAL_VOYAGER` | Neural Voyager | 25 | 0.50–0.70% | 2X | 90d | 15d |
| `NEURAL_NAVIGATOR` | Neural Navigator | 50 | 0.60–0.80% | 2X | 90d | 20d |
| `NEURAL_STRATEGIST` | Neural Strategist | 100 | 0.70–0.90% | 2X | 90d | 25d |
| `QUANT_CORE` | Quant Core | 500 | 0.80–1.00% | 3X | 90d | 30d |
| `QUANT_PRIME` | Quant Prime | 1,000 | 0.90–1.20% | 3X | 90d | 60d |
| `QUANT_APEX` | Quant Apex | 2,000 | 1.00–1.50% | 3X | 90d | 90d |
| `QUANT_TITAN` | Quant Titan | 4,000 | 1.10–1.80% | 4X | 150d | 120d |
| `QUANT_SOVEREIGN` | Quant Sovereign | 5,000 | 1.20–2.00% | 4X | 150d | 150d |

All initial items use:
- `AVAILABLE` availability;
- `RANDOM_RANGE` rate mode;
- `USER_NET_AFTER_SPLIT` rate meaning;
- `TOTAL_RETURN` cap basis;
- `INCLUDED_IN_TOTAL_RETURN` principal treatment;
- `NEXT_CALENDAR_DAY` reward start;
- `DAILY_CALENDAR` frequency;
- `CALENDAR_DAYS` cycle-day mode;
- `EVERY_DAY` reward-day mode;
- `AUTO_START_NEXT_CYCLE` cycle-end action while lifetime remains;
- `COMPLETE_PACKAGE` cap-reached action.

Package activation remains unavailable during PKG-01 even though catalogue items
are configured as available.

## 8. User-Package Boundary for Later Slices

Future `UserPackage` states:
- `PENDING_ACTIVATION`
- `ACTIVE`
- `PAUSED`
- `COMPLETED`
- `EXPIRED`
- `SUPERSEDED`
- `CANCELLED`
- `REVERSED`

Locked invariants:
- `PAYMENT_SUBMITTED` and `PAYMENT_APPROVED` are Deposit/Payment states, not
  package states.
- Activation requires approved payment, an audited manual activation, or a
  verified rule event.
- Every activation source uses a unique source ID/idempotency key.
- Renewals and upgrades create linked new records and never overwrite originals.
- `SINGLE_ACTIVE`/`MULTIPLE_ACTIVE` is enforced transactionally.
- No earnings, mutable balances or cap-consumed total belongs in `UserPackage`.
- Financial effects use immutable ledger events and linked reversals.

## 9. RBAC and Audit

Permissions introduced by PKG-01:
- `packages.read`
- `packages.draft.manage`

Rules:
- SUPER_ADMIN has implicit authority.
- ADMIN receives neither permission automatically.
- An explicitly delegated ADMIN may read/manage drafts through the existing RBAC
  workflow.
- Publication, published effective-date changes and plan closure require
  `SuperAdminOnlyGuard` authority and cannot be delegated.
- UI visibility follows permissions; NestJS remains authoritative.

Each mutation writes its audit row in the same serializable transaction with:
- actor and request IP/user agent;
- entity/version and aggregate revision;
- before/after snapshot;
- required reason;
- operation source.

Audit action mapping:
- draft/version/item creation: `CREATE`;
- draft/version/item changes: `UPDATE`;
- publication: `APPROVE` with metadata operation `PUBLISH`.

## 10. Locked API Surface

USER:
- `GET /packages`

ADMIN/SUPER_ADMIN:
- `GET /admin/package-plans`
- `POST /admin/package-plans/drafts`
- `GET /admin/package-plans/:planVersionId`
- `PATCH /admin/package-plans/:planVersionId`
- `POST /admin/package-plans/:planVersionId/items`
- `PATCH /admin/package-plans/:planVersionId/items/:itemId`
- `POST /admin/package-plans/:planVersionId/publish`

Before the first publication, USER receives an explicit empty-catalogue response.
All responses use `Cache-Control: no-store`.

## 11. Layer Boundaries

| Layer | PKG-01 responsibility |
|---|---|
| MySQL | Definitions, plan versions/items, revisions, effective dates and audit references |
| NestJS | DTO validation, draft aggregate commands, publication, effective resolution, RBAC and transactional audit |
| USER API | Protected read-only effective catalogue |
| ADMIN API | Version/draft read and management; SUPER_ADMIN-only publication/closure |
| Next.js BFF | Same-origin proxy; access/refresh tokens remain HttpOnly |
| UI | Dark Neo `/packages` management and `/user/packages` catalogue after API acceptance |
| Deferred modules | Deposit/TXID, activation, subscriptions, ledger, rewards, commissions and simulated activity |

## 12. Delivery Gate

1. Review migration and Prisma schema.
2. Generate Prisma client explicitly.
3. Run backend schema, formatting, lint, test and build gates.
4. Apply the reviewed migration explicitly on the local FixTradeZone database.
5. Run milestone migration status.
6. Complete the package Postman API gate.
7. Only then implement the matching BFF and UI.
8. Run integrated browser/API acceptance and update final milestone docs.
9. Open a PR only after every local gate is green.
