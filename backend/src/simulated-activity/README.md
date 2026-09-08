# Trade Activity backend boundary

The client-facing feature is **Trade Activity / Daily Trades**. The existing internal `simulated-activity` module, `simulated_*` tables, permission codes and API paths are intentionally retained for compatibility and to avoid rewriting immutable history.

- Events remain deterministic, immutable and idempotent per subscription/policy/local-date/slot.
- Generation is per ACTIVE package subscription. With the default five trades/day, two ACTIVE subscriptions can independently produce up to ten rows/day.
- Versioned policy now includes `minimumGapMinutes`; the recommended default for new/editable policy drafts is `240` (four hours).
- Historical PUBLISHED policies migrated with `minimumGapMinutes = NULL` preserve the exact legacy schedule; cloning such a policy creates a new draft with the current 240-minute default.
- Timing validation fails closed when the configured windows cannot fit the daily trade count and minimum gap. Five trades at a 240-minute gap require at least a 16-hour first-to-last span.
- The module does not represent external broker/exchange execution and never posts wallet, ledger, reward, cap, commission or deposit money.
- Policy publication is SUPER_ADMIN-only and activates on a safe local calendar-day boundary.
- Worker execution requires both the explicit infrastructure opt-in and Platform Operations `AUTOMATIC` mode.
- Reconciliation calls the same authoritative generator as the worker and cannot inject arbitrary outcomes or percentages.
- Policy changes, publication boundaries and reconciliation summaries are serialized into Prisma-compatible JSON audit metadata before persistence.

Authoritative revision rules are recorded in `docs/TRADE-ACTIVITY-REVISION-LOCK.md`.
